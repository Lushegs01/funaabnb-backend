const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Listing images storage
const listingStorage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: 'funspace/listings',
    allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
    transformation: [{ width: 1200, height: 900, crop: 'limit', quality: 'auto:good' }],
  },
});

// Avatar storage
const avatarStorage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: 'funspace/avatars',
    allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
    transformation: [{ width: 300, height: 300, crop: 'fill', gravity: 'face', quality: 'auto' }],
  },
});

// File filter — images only
const imageFileFilter = (req, file, cb) => {
  if (file.mimetype.startsWith('image/')) {
    cb(null, true);
  } else {
    cb(new Error('Only image files are allowed (jpg, png, webp)'), false);
  }
};

// Upload listing images (up to 10 photos)
exports.uploadListingImages = multer({
  storage: listingStorage,
  fileFilter: imageFileFilter,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB per file
}).array('images', 10);

// Upload avatar (single)
exports.uploadAvatar = multer({
  storage: avatarStorage,
  fileFilter: imageFileFilter,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
}).single('avatar');

// Delete image from Cloudinary
exports.deleteImage = async (publicId) => {
  try {
    await cloudinary.uploader.destroy(publicId);
  } catch (error) {
    console.error('Cloudinary delete error:', error);
  }
};
