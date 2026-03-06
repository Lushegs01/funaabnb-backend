const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { createReview, getListingReviews, replyToReview, deleteReview } = require('../controllers/reviewController');

// Public
router.get('/listing/:listingId', getListingReviews);

// Protected
router.use(auth.protect);
router.post('/', createReview);
router.patch('/:id/reply', auth.restrictTo('landlord', 'agent'), replyToReview);
router.delete('/:id', deleteReview);

module.exports = router;
