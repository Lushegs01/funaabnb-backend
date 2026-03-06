const Booking = require('../models/Booking');
const Listing = require('../models/Listing');
const User = require('../models/User');
const { initializePayment, verifyPayment, generateReference } = require('../utils/paystack');
const {
  sendBookingRequestEmail,
  sendBookingConfirmedEmail,
  sendBookingRejectedEmail,
  sendPaymentReceiptEmail,
} = require('../utils/email');

// ─── Create Booking Request ───────────────────────────────────

exports.createBooking = async (req, res, next) => {
  try {
    const { listingId, duration, moveInDate } = req.body;

    if (!listingId || !duration || !moveInDate) {
      return res.status(400).json({ success: false, message: 'listingId, duration, and moveInDate are required.' });
    }

    // Check listing exists and is available
    const listing = await Listing.findById(listingId).populate('landlord');
    if (!listing || listing.status !== 'approved') {
      return res.status(404).json({ success: false, message: 'Listing not found or not available.' });
    }
    if (!listing.isAvailable) {
      return res.status(400).json({ success: false, message: 'This listing is fully booked.' });
    }
    if (duration < listing.minDuration) {
      return res.status(400).json({ success: false, message: `Minimum booking duration is ${listing.minDuration} semester(s).` });
    }

    // Prevent landlord from booking their own listing
    if (listing.landlord._id.toString() === req.user._id.toString()) {
      return res.status(400).json({ success: false, message: 'You cannot book your own listing.' });
    }

    // Prevent duplicate active bookings
    const existing = await Booking.findOne({
      listing: listingId,
      tenant: req.user._id,
      status: { $in: ['pending', 'confirmed'] },
    });
    if (existing) {
      return res.status(400).json({ success: false, message: 'You already have an active booking for this listing.' });
    }

    // Calculate pricing
    const rentPerSemester = listing.price;
    const subtotal = rentPerSemester * duration;
    const serviceFee = Math.round(rentPerSemester * 0.05);
    const cautionDeposit = Math.round(rentPerSemester * listing.cautionDeposit);
    const total = subtotal + serviceFee + cautionDeposit;

    // Calculate move-out date (approx. 6 months per semester)
    const moveIn = new Date(moveInDate);
    const moveOut = new Date(moveIn);
    moveOut.setMonth(moveOut.getMonth() + duration * 6);

    const booking = await Booking.create({
      listing: listingId,
      tenant: req.user._id,
      landlord: listing.landlord._id,
      duration,
      moveInDate: moveIn,
      moveOutDate: moveOut,
      pricing: { rentPerSemester, subtotal, serviceFee, cautionDeposit, total },
    });

    // Notify landlord (non-blocking)
    try {
      const landlord = await User.findById(listing.landlord._id);
      await sendBookingRequestEmail(landlord, req.user, booking, listing);
    } catch (e) {
      console.error('Booking email error:', e.message);
    }

    await booking.populate([
      { path: 'listing', select: 'title images location price' },
      { path: 'landlord', select: 'firstName lastName phone' },
    ]);

    res.status(201).json({ success: true, booking });
  } catch (error) {
    next(error);
  }
};

// ─── Get My Bookings (tenant) ─────────────────────────────────

exports.getMyBookings = async (req, res, next) => {
  try {
    const { status } = req.query;
    const query = { tenant: req.user._id };
    if (status) query.status = status;

    const bookings = await Booking.find(query)
      .populate('listing', 'title images location type price')
      .populate('landlord', 'firstName lastName phone avatar')
      .sort('-createdAt');

    res.json({ success: true, results: bookings.length, bookings });
  } catch (error) {
    next(error);
  }
};

// ─── Get Incoming Bookings (landlord) ─────────────────────────

exports.getIncomingBookings = async (req, res, next) => {
  try {
    const { status } = req.query;
    const query = { landlord: req.user._id };
    if (status) query.status = status;

    const bookings = await Booking.find(query)
      .populate('listing', 'title images location')
      .populate('tenant', 'firstName lastName email phone avatar')
      .sort('-createdAt');

    res.json({ success: true, results: bookings.length, bookings });
  } catch (error) {
    next(error);
  }
};

// ─── Get Single Booking ───────────────────────────────────────

exports.getBooking = async (req, res, next) => {
  try {
    const booking = await Booking.findById(req.params.id)
      .populate('listing', 'title images location type price rules amenities')
      .populate('tenant', 'firstName lastName email phone avatar')
      .populate('landlord', 'firstName lastName email phone avatar');

    if (!booking) return res.status(404).json({ success: false, message: 'Booking not found.' });

    // Only tenant, landlord, or admin can view
    const isParty =
      booking.tenant._id.toString() === req.user._id.toString() ||
      booking.landlord._id.toString() === req.user._id.toString() ||
      req.user.userType === 'admin';

    if (!isParty) return res.status(403).json({ success: false, message: 'Not authorized.' });

    res.json({ success: true, booking });
  } catch (error) {
    next(error);
  }
};

// ─── Landlord: Confirm Booking ────────────────────────────────

exports.confirmBooking = async (req, res, next) => {
  try {
    const booking = await Booking.findById(req.params.id).populate('listing').populate('tenant');
    if (!booking) return res.status(404).json({ success: false, message: 'Booking not found.' });

    if (booking.landlord.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: 'Not authorized.' });
    }
    if (booking.status !== 'pending') {
      return res.status(400).json({ success: false, message: `Cannot confirm a booking with status: ${booking.status}` });
    }

    booking.status = 'confirmed';
    booking.confirmedAt = Date.now();
    await booking.save();

    // Notify tenant
    try {
      await sendBookingConfirmedEmail(booking.tenant, booking, booking.listing);
    } catch (e) {
      console.error('Confirm email error:', e.message);
    }

    res.json({ success: true, booking });
  } catch (error) {
    next(error);
  }
};

// ─── Landlord: Reject Booking ─────────────────────────────────

exports.rejectBooking = async (req, res, next) => {
  try {
    const booking = await Booking.findById(req.params.id).populate('listing').populate('tenant');
    if (!booking) return res.status(404).json({ success: false, message: 'Booking not found.' });

    if (booking.landlord.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: 'Not authorized.' });
    }
    if (booking.status !== 'pending') {
      return res.status(400).json({ success: false, message: 'Only pending bookings can be rejected.' });
    }

    booking.status = 'rejected';
    booking.rejectionReason = req.body.reason || '';
    booking.rejectedAt = Date.now();
    await booking.save();

    try {
      await sendBookingRejectedEmail(booking.tenant, booking.listing, booking.rejectionReason);
    } catch (e) {
      console.error('Reject email error:', e.message);
    }

    res.json({ success: true, booking });
  } catch (error) {
    next(error);
  }
};

// ─── Tenant: Cancel Booking ───────────────────────────────────

exports.cancelBooking = async (req, res, next) => {
  try {
    const booking = await Booking.findById(req.params.id);
    if (!booking) return res.status(404).json({ success: false, message: 'Booking not found.' });

    if (booking.tenant.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: 'Not authorized.' });
    }
    if (!['pending', 'confirmed'].includes(booking.status)) {
      return res.status(400).json({ success: false, message: 'This booking cannot be cancelled.' });
    }

    booking.status = 'cancelled';
    booking.cancellationReason = req.body.reason || '';
    booking.cancelledAt = Date.now();
    await booking.save();

    res.json({ success: true, message: 'Booking cancelled.', booking });
  } catch (error) {
    next(error);
  }
};

// ─── Initialize Payment ───────────────────────────────────────

exports.initPayment = async (req, res, next) => {
  try {
    const booking = await Booking.findById(req.params.id).populate('listing', 'title');
    if (!booking) return res.status(404).json({ success: false, message: 'Booking not found.' });

    if (booking.tenant.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: 'Not authorized.' });
    }
    if (booking.status !== 'confirmed') {
      return res.status(400).json({ success: false, message: 'Booking must be confirmed before payment.' });
    }
    if (booking.payment.status === 'paid') {
      return res.status(400).json({ success: false, message: 'Booking already paid.' });
    }

    const reference = generateReference('FSP');
    const paymentData = await initializePayment({
      email: req.user.email,
      amount: booking.pricing.total,
      reference,
      metadata: {
        bookingId: booking._id.toString(),
        listingTitle: booking.listing.title,
        tenantName: req.user.fullName,
      },
      callbackUrl: `${process.env.CLIENT_URL}/payment/verify?ref=${reference}`,
    });

    // Save reference
    booking.payment.reference = reference;
    booking.payment.accessCode = paymentData.access_code;
    booking.payment.status = 'pending';
    await booking.save();

    res.json({
      success: true,
      paymentUrl: paymentData.authorization_url,
      reference,
      accessCode: paymentData.access_code,
    });
  } catch (error) {
    next(error);
  }
};

// ─── Verify Payment ───────────────────────────────────────────

exports.verifyPayment = async (req, res, next) => {
  try {
    const { reference } = req.params;

    const booking = await Booking.findOne({ 'payment.reference': reference })
      .populate('listing', 'title location')
      .populate('tenant');

    if (!booking) return res.status(404).json({ success: false, message: 'Booking not found for this reference.' });

    // Verify with Paystack
    const txData = await verifyPayment(reference);

    if (txData.status === 'success') {
      booking.payment.status = 'paid';
      booking.payment.paidAt = new Date(txData.paid_at);
      booking.payment.channel = txData.channel;
      booking.payment.paystackResponse = txData;
      await booking.save();

      // Mark listing as unavailable if fully booked
      await Listing.findByIdAndUpdate(booking.listing._id, { isAvailable: false });

      // Send receipt
      try {
        await sendPaymentReceiptEmail(booking.tenant, booking, booking.listing);
      } catch (e) {
        console.error('Receipt email error:', e.message);
      }

      return res.json({ success: true, message: 'Payment verified. Your space is secured!', booking });
    }

    // Payment failed
    booking.payment.status = 'failed';
    await booking.save();
    res.status(400).json({ success: false, message: 'Payment was not successful. Please try again.' });
  } catch (error) {
    next(error);
  }
};
