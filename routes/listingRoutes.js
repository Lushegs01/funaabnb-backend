const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { uploadListingImages } = require('../middleware/upload');
const {
  getListings, getListing, createListing, updateListing,
  deleteListing, deleteListingImage, getMyListings,
  moderateListing, getFeaturedListings,
} = require('../controllers/listingController');

// Public
router.get('/', getListings);
router.get('/featured', getFeaturedListings);
router.get('/:id', auth.optionalAuth, getListing);

// Protected — authenticated users
router.use(auth.protect);
router.post('/', auth.restrictTo('landlord', 'agent', 'admin'), uploadListingImages, createListing);
router.get('/my/listings', getMyListings);
router.patch('/:id', auth.restrictTo('landlord', 'agent', 'admin'), uploadListingImages, updateListing);
router.delete('/:id', deleteListing);
router.delete('/:id/images', deleteListingImage);

// Admin only
router.patch('/:id/moderate', auth.restrictTo('admin'), moderateListing);

module.exports = router;
