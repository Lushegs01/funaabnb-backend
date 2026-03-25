const mongoose = require('mongoose');

const bookingSchema = new mongoose.Schema(
  {
    listing: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Listing',
      required: true,
    },
    tenant: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    landlord: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    // Duration in semesters
    duration: {
      type: Number,
      required: true,
      min: 1,
    },
    // Date range
    moveInDate: {
      type: Date,
      required: true,
    },
    moveOutDate: {
      type: Date,
      required: true,
    },
    // Pricing breakdown (snapshot at time of booking)
    pricing: {
      rentPerSemester: { type: Number, required: true },
      subtotal: { type: Number, required: true },      // rent × duration
      serviceFee: { type: Number, required: true },    // 5% of rent
      cautionDeposit: { type: Number, required: true }, // 25% of rent
      total: { type: Number, required: true },
    },
    // Booking lifecycle status
    status: {
      type: String,
      enum: ['pending', 'confirmed', 'rejected', 'cancelled', 'completed'],
      default: 'pending',
    },
    rejectionReason: String,
    cancellationReason: String,
    // Paystack payment
    payment: {
      reference: { type: String },        // Paystack reference
      accessCode: { type: String },       // Paystack access code
      status: {
        type: String,
        enum: ['unpaid', 'pending', 'paid', 'refunded', 'failed'],
        default: 'unpaid',
      },
      paidAt: Date,
      channel: String,                    // card, bank, ussd, etc.
      paystackResponse: mongoose.Schema.Types.Mixed,
    },
    // Timestamps
    confirmedAt: Date,
    rejectedAt: Date,
    cancelledAt: Date,
    completedAt: Date,
    // Review flag
    reviewLeft: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Indexes
bookingSchema.index({ tenant: 1 });
bookingSchema.index({ landlord: 1 });
bookingSchema.index({ listing: 1 });
bookingSchema.index({ status: 1 });
bookingSchema.index({ 'payment.reference': 1 });

// Virtual: is booking active
bookingSchema.virtual('isActive').get(function () {
  return this.status === 'confirmed' && this.payment.status === 'paid';
});

module.exports = mongoose.model('Booking', bookingSchema);
