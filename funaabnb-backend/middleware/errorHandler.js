// Central error handler — catches everything thrown via next(error)

const errorHandler = (err, req, res, next) => {
  let error = { ...err };
  error.message = err.message;

  // Log in development
  if (process.env.NODE_ENV === 'development') {
    console.error('ERROR 💥', err);
  }

  // Mongoose: bad ObjectId
  if (err.name === 'CastError') {
    error.message = `Resource not found with id: ${err.value}`;
    error.statusCode = 404;
  }

  // Mongoose: duplicate key
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue)[0];
    const value = err.keyValue[field];
    error.message = `${field.charAt(0).toUpperCase() + field.slice(1)} "${value}" is already in use.`;
    error.statusCode = 400;
  }

  // Mongoose: validation error
  if (err.name === 'ValidationError') {
    const messages = Object.values(err.errors).map((e) => e.message);
    error.message = messages.join('. ');
    error.statusCode = 400;
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    error.message = 'Invalid token. Please log in again.';
    error.statusCode = 401;
  }
  if (err.name === 'TokenExpiredError') {
    error.message = 'Token expired. Please log in again.';
    error.statusCode = 401;
  }

  // Multer: file too large
  if (err.code === 'LIMIT_FILE_SIZE') {
    error.message = 'File too large. Maximum size is 10MB.';
    error.statusCode = 400;
  }

  res.status(error.statusCode || 500).json({
    success: false,
    message: error.message || 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
};

module.exports = errorHandler;
