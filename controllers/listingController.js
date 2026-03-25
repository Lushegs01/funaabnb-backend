const Listing = require('../models/Listing');
const { deleteImage } = require('../middleware/upload');

// ─── Get All Listings (with filtering, search, pagination) ────

exports.getListings = async (req, res, next) => {
  try {
    const {
      type, minPrice, maxPrice, area, amenities,
      available, search, page = 1, limit = 12, sort = '-createdAt',
    } = req.query;

    const query = { status: 'approved' };

    // Filters
    if (type) query.type = type;
    if (available !== undefined) query.isAvailable = available === 'true';
    if (area) query['location.area'] = { $regex: area, $options: 'i' };
    if (minPrice || maxPrice) {
      query.price = {};
      if (minPrice) query.price.$gte = Number(minPrice);
      if (maxPrice) query.price.$lte = Number(maxPrice);
    }
    if (amenities) {
      const list = amenities.split(',').map((a) => a.trim());
      query.amenities = { $all: list };
    }

    // Text search
    if (search) {
      query.$text = { $search: search };
    }

    const skip = (Number(page) - 1) * Number(limit);
    const total = await Listing.countDocuments(query);

    const listings = await Listing.find(query)
      .populate('landlord', 'firstName lastName avatar isVerified userType')
      .sort(sort)
      .skip(skip)
      .limit(Number(limit));

    res.json({
      success: true,
      total,
      page: Number(page),
      pages: Math.ceil(total / Number(limit)),
      results: listings.length,
      listings,
    });
  } catch (error) {
    next(error);
  }
};

// ─── Get Single Listing ───────────────────────────────────────

exports.getListing = async (req, res, next) => {
  try {
    const listing = await Listing.findOne({
      $or: [{ _id: req.params.id }, { slug: req.params.id }],
    }).populate('landlord', 'firstName lastName avatar isVerified userType phone createdAt');

    if (!listing) {
      return res.status(404).json({ success: false, message: 'Listing not found.' });
    }

    // Only show approved listings to the public (owners/admin can see all)
    if (listing.status !== 'approved') {
      const isOwner = req.user && listing.landlord._id.toString() === req.user._id.toString();
      const isAdmin = req.user && req.user.userType === 'admin';
      if (!isOwner && !isAdmin) {
        return res.status(404).json({ success: false, message: 'Listing not found.' });
      }
    }

    // Increment view count (fire and forget)
    Listing.findByIdAndUpdate(listing._id, { $inc: { viewCount: 1 } }).exec();

    res.json({ success: true, listing });
  } catch (error) {
    next(error);
  }
};

// ─── Create Listing ───────────────────────────────────────────

exports.createListing = async (req, res, next) => {
  try {
    const {
      title, description, type, price,
      address, area, city, state, lat, lng,
      distanceFromCampus, amenities, rules,
      maxOccupants, minDuration, cautionDeposit,
    } = req.body;

    // Parse amenities and rules (sent as JSON strings or comma-separated)
    let parsedAmenities = [];
    let parsedRules = [];
    try {
      parsedAmenities = typeof amenities === 'string' ? JSON.parse(amenities) : amenities || [];
      parsedRules = typeof rules === 'string' ? JSON.parse(rules) : rules || [];
    } catch {
      parsedAmenities = amenities ? amenities.split(',') : [];
      parsedRules = rules ? rules.split(',') : [];
    }

    // Process uploaded images
    const images = req.files
      ? req.files.map((file) => ({ url: file.path, publicId: file.filename }))
      : [];

    const listing = await Listing.create({
      title,
      description,
      type,
      price: Number(price),
      location: { address, area, city: city || 'Abeokuta', state: state || 'Ogun', coordinates: { lat: Number(lat) || undefined, lng: Number(lng) || undefined } },
      distanceFromCampus,
      amenities: parsedAmenities,
      rules: parsedRules,
      images,
      maxOccupants: Number(maxOccupants) || 1,
      minDuration: Number(minDuration) || 1,
      cautionDeposit: Number(cautionDeposit) || 0.25,
      landlord: req.user._id,
      status: 'pending', // always starts pending for admin review
    });

    res.status(201).json({ success: true, listing });
  } catch (error) {
    next(error);
  }
};

// ─── Update Listing ───────────────────────────────────────────

exports.updateListing = async (req, res, next) => {
  try {
    let listing = await Listing.findById(req.params.id);
    if (!listing) {
      return res.status(404).json({ success: false, message: 'Listing not found.' });
    }

    // Only owner or admin can update
    if (listing.landlord.toString() !== req.user._id.toString() && req.user.userType !== 'admin') {
      return res.status(403).json({ success: false, message: 'Not authorized to update this listing.' });
    }

    const allowedUpdates = [
      'title', 'description', 'price', 'amenities', 'rules',
      'isAvailable', 'maxOccupants', 'minDuration', 'cautionDeposit', 'distanceFromCampus',
    ];
    const updates = {};
    allowedUpdates.forEach((field) => {
      if (req.body[field] !== undefined) updates[field] = req.body[field];
    });

    // Handle new image uploads
    if (req.files && req.files.length > 0) {
      const newImages = req.files.map((f) => ({ url: f.path, publicId: f.filename }));
      updates.images = [...listing.images, ...newImages];
    }

    // Re-submit for review if content changed significantly
    if (['title', 'description', 'price'].some((f) => updates[f])) {
      updates.status = 'pending';
    }

    listing = await Listing.findByIdAndUpdate(req.params.id, updates, { new: true, runValidators: true });
    res.json({ success: true, listing });
  } catch (error) {
    next(error);
  }
};

// ─── Delete Listing ───────────────────────────────────────────

exports.deleteListing = async (req, res, next) => {
  try {
    const listing = await Listing.findById(req.params.id);
    if (!listing) {
      return res.status(404).json({ success: false, message: 'Listing not found.' });
    }

    if (listing.landlord.toString() !== req.user._id.toString() && req.user.userType !== 'admin') {
      return res.status(403).json({ success: false, message: 'Not authorized.' });
    }

    // Remove images from Cloudinary
    await Promise.all(listing.images.map((img) => deleteImage(img.publicId)));

    await listing.deleteOne();
    res.json({ success: true, message: 'Listing deleted successfully.' });
  } catch (error) {
    next(error);
  }
};

// ─── Delete a specific image from listing ─────────────────────

exports.deleteListingImage = async (req, res, next) => {
  try {
    const listing = await Listing.findById(req.params.id);
    if (!listing) return res.status(404).json({ success: false, message: 'Listing not found.' });

    if (listing.landlord.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: 'Not authorized.' });
    }

    const { publicId } = req.body;
    const imageIndex = listing.images.findIndex((img) => img.publicId === publicId);
    if (imageIndex === -1) {
      return res.status(404).json({ success: false, message: 'Image not found.' });
    }

    await deleteImage(publicId);
    listing.images.splice(imageIndex, 1);
    await listing.save();

    res.json({ success: true, listing });
  } catch (error) {
    next(error);
  }
};

// ─── Get My Listings (landlord) ───────────────────────────────

exports.getMyListings = async (req, res, next) => {
  try {
    const listings = await Listing.find({ landlord: req.user._id }).sort('-createdAt');
    res.json({ success: true, results: listings.length, listings });
  } catch (error) {
    next(error);
  }
};

// ─── Admin: approve / reject listing ─────────────────────────

exports.moderateListing = async (req, res, next) => {
  try {
    const { action, reason } = req.body; // action: 'approve' | 'reject' | 'suspend'
    const update = {};

    if (action === 'approve') {
      update.status = 'approved';
      update.rejectionReason = undefined;
    } else if (action === 'reject') {
      update.status = 'rejected';
      update.rejectionReason = reason;
    } else if (action === 'suspend') {
      update.status = 'suspended';
    } else {
      return res.status(400).json({ success: false, message: 'Invalid action.' });
    }

    const listing = await Listing.findByIdAndUpdate(req.params.id, update, { new: true });
    if (!listing) return res.status(404).json({ success: false, message: 'Listing not found.' });

    res.json({ success: true, listing });
  } catch (error) {
    next(error);
  }
};

// ─── Featured Listings ────────────────────────────────────────

exports.getFeaturedListings = async (req, res, next) => {
  try {
    const listings = await Listing.find({ status: 'approved', featured: true, isAvailable: true })
      .populate('landlord', 'firstName lastName avatar isVerified')
      .sort('-averageRating')
      .limit(6);
    res.json({ success: true, listings });
  } catch (error) {
    next(error);
  }
};
