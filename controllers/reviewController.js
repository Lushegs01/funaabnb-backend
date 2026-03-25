const Review = require('../models/Review');
const Booking = require('../models/Booking');
const Listing = require('../models/Listing');

// ─── Create Review ────────────────────────────────────────────

exports.createReview = async (req, res, next) => {
  try {
    const { listingId, bookingId, ratings, comment } = req.body;

    // Validate booking belongs to user and is completed/paid
    const booking = await Booking.findById(bookingId);
    if (!booking) return res.status(404).json({ success: false, message: 'Booking not found.' });

    if (booking.tenant.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: 'You can only review your own bookings.' });
    }
    if (booking.payment.status !== 'paid') {
      return res.status(400).json({ success: false, message: 'You must have completed payment before leaving a review.' });
    }
    if (booking.reviewLeft) {
      return res.status(400).json({ success: false, message: 'You have already reviewed this booking.' });
    }

    const listing = await Listing.findById(listingId);
    if (!listing) return res.status(404).json({ success: false, message: 'Listing not found.' });

    const review = await Review.create({
      listing: listingId,
      reviewer: req.user._id,
      booking: bookingId,
      ratings,
      comment,
    });

    // Mark booking as reviewed
    await Booking.findByIdAndUpdate(bookingId, { reviewLeft: true });

    await review.populate('reviewer', 'firstName lastName avatar');
    res.status(201).json({ success: true, review });
  } catch (error) {
    next(error);
  }
};

// ─── Get Reviews for a Listing ────────────────────────────────

exports.getListingReviews = async (req, res, next) => {
  try {
    const { page = 1, limit = 10 } = req.query;
    const skip = (page - 1) * limit;

    const total = await Review.countDocuments({ listing: req.params.listingId, isVisible: true });
    const reviews = await Review.find({ listing: req.params.listingId, isVisible: true })
      .populate('reviewer', 'firstName lastName avatar')
      .sort('-createdAt')
      .skip(skip)
      .limit(Number(limit));

    res.json({ success: true, total, page: Number(page), pages: Math.ceil(total / limit), reviews });
  } catch (error) {
    next(error);
  }
};

// ─── Landlord Reply ───────────────────────────────────────────

exports.replyToReview = async (req, res, next) => {
  try {
    const review = await Review.findById(req.params.id).populate('listing');
    if (!review) return res.status(404).json({ success: false, message: 'Review not found.' });

    if (review.listing.landlord.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: 'Only the landlord can reply to this review.' });
    }

    review.landlordReply = { text: req.body.text, repliedAt: new Date() };
    await review.save();

    res.json({ success: true, review });
  } catch (error) {
    next(error);
  }
};

// ─── Delete Review (admin or reviewer) ───────────────────────

exports.deleteReview = async (req, res, next) => {
  try {
    const review = await Review.findById(req.params.id);
    if (!review) return res.status(404).json({ success: false, message: 'Review not found.' });

    const isReviewer = review.reviewer.toString() === req.user._id.toString();
    const isAdmin = req.user.userType === 'admin';
    if (!isReviewer && !isAdmin) {
      return res.status(403).json({ success: false, message: 'Not authorized.' });
    }

    await review.deleteOne(); // triggers post hook to recalculate ratings
    res.json({ success: true, message: 'Review deleted.' });
  } catch (error) {
    next(error);
  }
};
