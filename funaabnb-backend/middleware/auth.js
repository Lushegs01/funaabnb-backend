const jwt = require('jsonwebtoken');
const User = require('../models/User');

// Verify access token and attach user to request
exports.protect = async (req, res, next) => {
  try {
    // 1. Get token from Authorization header or cookie
    let token;
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
      token = req.headers.authorization.split(' ')[1];
    } else if (req.cookies?.accessToken) {
      token = req.cookies.accessToken;
    }

    if (!token) {
      return res.status(401).json({ success: false, message: 'Not authenticated. Please log in.' });
    }

    // 2. Verify token
    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (err) {
      if (err.name === 'TokenExpiredError') {
        return res.status(401).json({ success: false, message: 'Session expired. Please log in again.', code: 'TOKEN_EXPIRED' });
      }
      return res.status(401).json({ success: false, message: 'Invalid token.' });
    }

    // 3. Check user still exists and is active
    const user = await User.findById(decoded.id).select('+refreshToken');
    if (!user || !user.isActive) {
      return res.status(401).json({ success: false, message: 'User no longer exists or has been deactivated.' });
    }

    // 4. Attach user to request
    req.user = user;
    next();
  } catch (error) {
    next(error);
  }
};

// Restrict to specific roles
exports.restrictTo = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.userType)) {
      return res.status(403).json({
        success: false,
        message: `Access denied. This route is for: ${roles.join(', ')}.`,
      });
    }
    next();
  };
};

// Optional auth — attaches user if token present but doesn't block if not
exports.optionalAuth = async (req, res, next) => {
  try {
    let token;
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
      token = req.headers.authorization.split(' ')[1];
    }
    if (token) {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      req.user = await User.findById(decoded.id);
    }
    next();
  } catch {
    next(); // silently continue even if token is invalid
  }
};
