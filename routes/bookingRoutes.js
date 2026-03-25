const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const {
  createBooking, getMyBookings, getIncomingBookings,
  getBooking, confirmBooking, rejectBooking, cancelBooking,
  initPayment, verifyPayment,
} = require('../controllers/bookingController');

router.use(auth.protect);

// Tenant
router.post('/', createBooking);
router.get('/my', getMyBookings);
router.delete('/:id/cancel', cancelBooking);
router.post('/:id/pay', initPayment);
router.get('/verify/:reference', verifyPayment);

// Landlord
router.get('/incoming', auth.restrictTo('landlord', 'agent', 'admin'), getIncomingBookings);
router.patch('/:id/confirm', auth.restrictTo('landlord', 'agent', 'admin'), confirmBooking);
router.patch('/:id/reject', auth.restrictTo('landlord', 'agent', 'admin'), rejectBooking);

// Shared — both parties
router.get('/:id', getBooking);

module.exports = router;
