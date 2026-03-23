const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { validationResult } = require('express-validator');
const User = require('../models/User');
const { sendVerificationEmail, sendPasswordResetEmail } = require('../utils/email');

const { OAuth2Client } = require('google-auth-library');
const User = require('../models/User'); // Adjust path to your User model if needed
const jwt = require('jsonwebtoken'); // Assuming you use jsonwebtoken

// Initialize the Google Client
const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

exports.googleLogin = async (req, res, next) => {
  try {
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({ success: false, message: 'No Google token provided' });
    }

    // 1. Verify the token securely with Google
    const ticket = await client.verifyIdToken({
      idToken: token,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();
    const { email, given_name, family_name, picture } = payload;

    // 2. Check if this user already exists in your database
    let user = await User.findOne({ email });

    // 3. If they don't exist, automatically create a new account for them
    if (!user) {
      user = await User.create({
        firstName: given_name,
        lastName: family_name || '', // Google sometimes omits family_name
        email: email,
        isVerified: true, // Google emails are pre-verified!
        userType: 'student',
        authProvider: 'google', // Defaulting to 'student' for FunSpace
        // avatar: { url: picture } // Uncomment if your schema stores profile pictures
      });
    }

    // 4. Generate your standard FunSpace Access Token
    // Note: If you have a custom token generation function in your app, use that here instead!
    const accessToken = jwt.sign(
      { id: user._id },
      process.env.JWT_SECRET,
      { expiresIn: '30d' }
    );

    // 5. Send the token and user data back to the Vercel frontend
    res.status(200).json({
      success: true,
      accessToken,
      user: {
        _id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        userType: user.userType,
        isVerified: user.isVerified
      }
    });

  } catch (error) {
    console.error('Google Auth Error:', error);
    res.status(401).json({ success: false, message: 'Google Authentication failed. Please try again.' });
  }
};

// ─── Token helpers ────────────────────────────────────────────

const signAccessToken = (id) =>
  jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '7d' });

const signRefreshToken = (id) =>
  jwt.sign({ id }, process.env.JWT_REFRESH_SECRET, { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '30d' });

const sendTokens = (user, statusCode, res) => {
  const accessToken = signAccessToken(user._id);
  const refreshToken = signRefreshToken(user._id);

  // Attach response
  res.status(statusCode).json({
    success: true,
    accessToken,
    refreshToken,
    user,
  });
};

// ─── Register ────────────────────────────────────────────────

exports.register = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { firstName, lastName, email, phone, password, userType, school } = req.body;

    // Check duplicate email
    const existing = await User.findOne({ email });
    if (existing) {
      return res.status(400).json({ success: false, message: 'Email already registered.' });
    }

    // Generate email verification token
    const verificationToken = crypto.randomBytes(32).toString('hex');
    const verificationExpires = Date.now() + 24 * 60 * 60 * 1000; // 24h

    const user = await User.create({
      firstName,
      lastName,
      email,
      phone,
      password,
      userType,
      school: school || '',
      emailVerificationToken: crypto.createHash('sha256').update(verificationToken).digest('hex'),
      emailVerificationExpires: verificationExpires,
    });

    // Send verification email (non-blocking)
    try {
      await sendVerificationEmail(user, verificationToken);
    } catch (emailErr) {
      console.error('Failed to send verification email:', emailErr.message);
    }

    sendTokens(user, 201, res);
  } catch (error) {
    next(error);
  }
};

// ─── Verify Email ─────────────────────────────────────────────

exports.verifyEmail = async (req, res, next) => {
  try {
    const hashedToken = crypto.createHash('sha256').update(req.params.token).digest('hex');

    const user = await User.findOne({
      emailVerificationToken: hashedToken,
      emailVerificationExpires: { $gt: Date.now() },
    });

    if (!user) {
      return res.status(400).json({ success: false, message: 'Invalid or expired verification link.' });
    }

    user.isVerified = true;
    user.emailVerificationToken = undefined;
    user.emailVerificationExpires = undefined;
    await user.save();

    res.json({ success: true, message: 'Email verified successfully! You can now log in.' });
  } catch (error) {
    next(error);
  }
};

// ─── Login ────────────────────────────────────────────────────

exports.login = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { email, password } = req.body;

    // Find user with password field
    const user = await User.findOne({ email }).select('+password');
    if (!user || !user.password) {
      return res.status(401).json({ success: false, message: 'Invalid email or password.' });
    }

    // Check password
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Invalid email or password.' });
    }

    if (!user.isActive) {
      return res.status(403).json({ success: false, message: 'Account has been deactivated. Contact support.' });
    }

    // Update last login
    user.lastLogin = Date.now();
    await user.save({ validateBeforeSave: false });

    sendTokens(user, 200, res);
  } catch (error) {
    next(error);
  }
};

// ─── Refresh Token ────────────────────────────────────────────

exports.refreshToken = async (req, res, next) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      return res.status(401).json({ success: false, message: 'Refresh token required.' });
    }

    let decoded;
    try {
      decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
    } catch {
      return res.status(401).json({ success: false, message: 'Invalid or expired refresh token.' });
    }

    const user = await User.findById(decoded.id);
    if (!user || !user.isActive) {
      return res.status(401).json({ success: false, message: 'User not found.' });
    }

    const accessToken = signAccessToken(user._id);
    res.json({ success: true, accessToken });
  } catch (error) {
    next(error);
  }
};

// ─── Get Current User ─────────────────────────────────────────

exports.getMe = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id).populate('savedListings', 'title images price type location');
    res.json({ success: true, user });
  } catch (error) {
    next(error);
  }
};

// ─── Update Profile ───────────────────────────────────────────

exports.updateProfile = async (req, res, next) => {
  try {
    const allowedFields = ['firstName', 'lastName', 'phone', 'school'];
    const updates = {};
    allowedFields.forEach((field) => {
      if (req.body[field] !== undefined) updates[field] = req.body[field];
    });

    // Handle avatar upload
    if (req.file) {
      updates['avatar.url'] = req.file.path;
      updates['avatar.publicId'] = req.file.filename;
    }

    const user = await User.findByIdAndUpdate(req.user._id, updates, { new: true, runValidators: true });
    res.json({ success: true, user });
  } catch (error) {
    next(error);
  }
};

// ─── Change Password ──────────────────────────────────────────

exports.changePassword = async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;

    const user = await User.findById(req.user._id).select('+password');
    if (!user.password) {
      return res.status(400).json({ success: false, message: 'Cannot change password for Google accounts.' });
    }

    const isMatch = await user.comparePassword(currentPassword);
    if (!isMatch) {
      return res.status(400).json({ success: false, message: 'Current password is incorrect.' });
    }

    user.password = newPassword;
    await user.save();

    res.json({ success: true, message: 'Password changed successfully.' });
  } catch (error) {
    next(error);
  }
};

// ─── Forgot Password ──────────────────────────────────────────

exports.forgotPassword = async (req, res, next) => {
  try {
    const user = await User.findOne({ email: req.body.email });

    // Always return success to prevent email enumeration
    if (!user) {
      return res.json({ success: true, message: 'If that email exists, a reset link has been sent.' });
    }

    const resetToken = crypto.randomBytes(32).toString('hex');
    user.passwordResetToken = crypto.createHash('sha256').update(resetToken).digest('hex');
    user.passwordResetExpires = Date.now() + 60 * 60 * 1000; // 1 hour
    await user.save({ validateBeforeSave: false });

    try {
      await sendPasswordResetEmail(user, resetToken);
    } catch (emailErr) {
      user.passwordResetToken = undefined;
      user.passwordResetExpires = undefined;
      await user.save({ validateBeforeSave: false });
      return next(new Error('Failed to send reset email. Try again.'));
    }

    res.json({ success: true, message: 'Password reset link sent to your email.' });
  } catch (error) {
    next(error);
  }
};

// ─── Reset Password ───────────────────────────────────────────

exports.resetPassword = async (req, res, next) => {
  try {
    const hashedToken = crypto.createHash('sha256').update(req.params.token).digest('hex');

    const user = await User.findOne({
      passwordResetToken: hashedToken,
      passwordResetExpires: { $gt: Date.now() },
    });

    if (!user) {
      return res.status(400).json({ success: false, message: 'Invalid or expired reset link.' });
    }

    user.password = req.body.password;
    user.passwordResetToken = undefined;
    user.passwordResetExpires = undefined;
    await user.save();

    sendTokens(user, 200, res);
  } catch (error) {
    next(error);
  }
};

// ─── Save / Unsave Listing ────────────────────────────────────

exports.toggleSaveListing = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id);
    const listingId = req.params.listingId;

    const isSaved = user.savedListings.includes(listingId);
    if (isSaved) {
      user.savedListings.pull(listingId);
    } else {
      user.savedListings.push(listingId);
    }
    await user.save({ validateBeforeSave: false });

    res.json({
      success: true,
      saved: !isSaved,
      message: isSaved ? 'Removed from saved listings' : 'Added to saved listings',
    });
  } catch (error) {
    next(error);
  }
};
