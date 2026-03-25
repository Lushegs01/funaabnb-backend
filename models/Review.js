const mongoose = require('mongoose');

const reviewSchema = new mongoose.Schema(
  {
    listing: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Listing',
      required: true,
    },
    reviewer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    booking: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Booking',
      required: true,
    },
    // Ratings (1–5 each)
    ratings: {
      overall: { type: Number, required: true, min: 1, max: 5 },
      cleanliness: { type: Number, min: 1, max: 5 },
      location: { type: Number, min: 1, max: 5 },
      valueForMoney: { type: Number, min: 1, max: 5 },
      landlordResponse: { type: Number, min: 1, max: 5 },
    },
    comment: {
      type: String,
      required: [true, 'Review comment is required'],
      minlength: [20, 'Comment must be at least 20 characters'],
      maxlength: [1000, 'Comment cannot exceed 1000 characters'],
    },
    // Landlord can respond
    landlordReply: {
      text: String,
      repliedAt: Date,
    },
    isVisible: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

// One review per booking
reviewSchema.index({ booking: 1 }, { unique: true });
reviewSchema.index({ listing: 1 });
reviewSchema.index({ reviewer: 1 });

// After save/delete: recalculate listing's averageRating and reviewCount
reviewSchema.statics.calcAverageRatings = async function (listingId) {
  const stats = await this.aggregate([
    { $match: { listing: listingId, isVisible: true } },
    {
      $group: {
        _id: '$listing',
        count: { $sum: 1 },
        avgRating: { $avg: '$ratings.overall' },
      },
    },
  ]);

  const Listing = require('./Listing');
  if (stats.length > 0) {
    await Listing.findByIdAndUpdate(listingId, {
      averageRating: stats[0].avgRating,
      reviewCount: stats[0].count,
    });
  } else {
    await Listing.findByIdAndUpdate(listingId, {
      averageRating: 0,
      reviewCount: 0,
    });
  }
};

reviewSchema.post('save', function () {
  this.constructor.calcAverageRatings(this.listing);
});

reviewSchema.post('findOneAndDelete', function (doc) {
  if (doc) doc.constructor.calcAverageRatings(doc.listing);
});

module.exports = mongoose.model('Review', reviewSchema);
