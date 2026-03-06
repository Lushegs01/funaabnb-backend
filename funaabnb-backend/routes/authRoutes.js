const express = require('express');
const { body } = require('express-validator');
const router = express.Router();
const auth = require('../middleware/auth');
const { uploadAvatar } = require('../middleware/upload');
const {
  register, login, verifyEmail, refreshToken,
  getMe, updateProfile, changePassword,
  forgotPassword, resetPassword, toggleSaveListing,
} = require('../controllers/authController');

// Validation rules
const registerValidation = [
  body('firstName').trim().notEmpty().withMessage('First name is required'),
  body('lastName').trim().notEmpty().withMessage('Last name is required'),
  body('email').isEmail().normalizeEmail().withMessage('Valid email required'),
  body('phone').notEmpty().withMessage('Phone number is required'),
  body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
  body('userType').isIn(['student', 'landlord', 'agent']).withMessage('Invalid user type'),
];

const loginValidation = [
  body('email').isEmail().normalizeEmail().withMessage('Valid email required'),
  body('password').notEmpty().withMessage('Password is required'),
];

// Public routes
router.post('/register', registerValidation, register);
router.post('/login', loginValidation, login);
router.get('/verify-email/:token', verifyEmail);
router.post('/refresh-token', refreshToken);
router.post('/forgot-password', forgotPassword);
router.patch('/reset-password/:token', resetPassword);

// Protected routes
router.use(auth.protect);
router.get('/me', getMe);
router.patch('/update-profile', uploadAvatar, updateProfile);
router.patch('/change-password', changePassword);
router.post('/save-listing/:listingId', toggleSaveListing);

module.exports = router;
