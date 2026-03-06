const mongoose = require('mongoose');
const slugify = require('slugify');

const listingSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, 'Listing title is required'],
      trim: true,
      maxlength: [100, 'Title cannot exceed 100 characters'],
    },
    slug: {
      type: String,
      unique: true,
    },
    description: {
      type: String,
      required: [true, 'Description is required'],
      maxlength: [2000, 'Description cannot exceed 2000 characters'],
    },
    type: {
      type: String,
      enum: ['single', 'selfcon', 'flat', 'hostel'],
      required: [true, 'Listing type is required'],
    },
    price: {
      type: Number,
      required: [true, 'Price is required'],
      min: [1000, 'Price must be at least ₦1,000'],
    },
    // Location
    location: {
      address: { type: String, required: true },
      area: { type: String, required: true },
      city: { type: String, default: 'Abeokuta' },
      state: { type: String, default: 'Ogun' },
      coordinates: {
        lat: { type: Number },
        lng: { type: Number },
      },
    },
    distanceFromCampus: {
      type: String,
      enum: [
        'On campus',
        'Less than 0.5km',
        '0.5km - 1km',
        '1km - 2km',
        '2km - 3km',
        'More than 3km',
      ],
    },
    // Images (stored on Cloudinary)
    images: [
      {
        url: { type: String, required: true },
        publicId: { type: String, required: true },
      },
    ],
    // Amenities
    amenities: [
      {
        type: String,
        enum: [
          'wifi',
          'water',
          'security',
          'kitchen',
          'parking',
          'generator',
          'laundry',
          'cafeteria',
          'gym',
          'pool',
          'ac',
          'cctv',
          'fenced',
        ],
      },
    ],
    // House rules
    rules: [{ type: String, trim: true }],
    // Availability
    isAvailable: {
      type: Boolean,
      default: true,
    },
    maxOccupants: {
      type: Number,
      default: 1,
      min: 1,
    },
    minDuration: {
      type: Number, // semesters
      default: 1,
      min: 1,
    },
    cautionDeposit: {
      type: Number, // multiplier e.g. 0.25 = 25% of rent
      default: 0.25,
    },
    // Moderation
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected', 'suspended'],
      default: 'pending',
    },
    rejectionReason: String,
    featured: {
      type: Boolean,
      default: false,
    },
    // Owner
    landlord: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    // Computed stats (updated via hooks)
    averageRating: {
      type: Number,
      default: 0,
      min: 0,
      max: 5,
      set: (val) => Math.round(val * 10) / 10, // round to 1 decimal
    },
    reviewCount: {
      type: Number,
      default: 0,
    },
    viewCount: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Indexes
listingSchema.index({ 'location.area': 1 });
listingSchema.index({ type: 1 });
listingSchema.index({ price: 1 });
listingSchema.index({ status: 1 });
listingSchema.index({ landlord: 1 });
listingSchema.index({ slug: 1 });
listingSchema.index(
  { title: 'text', 'location.address': 'text', 'location.area': 'text' },
  { name: 'search_index' }
);

// Auto-generate slug from title
listingSchema.pre('save', function (next) {
  if (this.isModified('title')) {
    this.slug = slugify(this.title, { lower: true, strict: true }) + '-' + Date.now();
  }
  next();
});

module.exports = mongoose.model('Listing', listingSchema);
