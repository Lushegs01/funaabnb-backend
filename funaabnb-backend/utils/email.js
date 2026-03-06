const nodemailer = require('nodemailer');

const createTransporter = () =>
  nodemailer.createTransport({
    host: process.env.EMAIL_HOST,
    port: parseInt(process.env.EMAIL_PORT),
    secure: process.env.EMAIL_PORT === '465',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });

// Base send function
const sendEmail = async ({ to, subject, html }) => {
  const transporter = createTransporter();
  await transporter.sendMail({
    from: process.env.EMAIL_FROM,
    to,
    subject,
    html,
  });
};

// ─── Email Templates ──────────────────────────────────────────

const baseTemplate = (content) => `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: 'Segoe UI', Arial, sans-serif; background:#f4f4f4; margin:0; padding:0; }
    .container { max-width:600px; margin:30px auto; background:#fff; border-radius:12px; overflow:hidden; box-shadow:0 2px 12px rgba(0,0,0,0.08); }
    .header { background:#166534; padding:28px 32px; text-align:center; }
    .header h1 { color:#fff; margin:0; font-size:22px; }
    .header span { color:#dcfce7; font-size:13px; }
    .body { padding:32px; color:#374151; line-height:1.6; }
    .btn { display:inline-block; background:#166534; color:#fff!important; text-decoration:none; padding:12px 28px; border-radius:8px; font-weight:600; margin:16px 0; }
    .footer { background:#f9fafb; padding:20px 32px; text-align:center; font-size:12px; color:#9ca3af; border-top:1px solid #e5e7eb; }
    .divider { border:none; border-top:1px solid #e5e7eb; margin:24px 0; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🎓 FunSpace</h1>
      <span>Student Housing Platform — FUNAAB</span>
    </div>
    <div class="body">${content}</div>
    <div class="footer">© ${new Date().getFullYear()} FunSpace. Built for FUNAAB students.<br>Questions? Reply to this email.</div>
  </div>
</body>
</html>`;

// Verify email
exports.sendVerificationEmail = async (user, token) => {
  const url = `${process.env.CLIENT_URL}/verify-email?token=${token}`;
  await sendEmail({
    to: user.email,
    subject: 'Verify your FunSpace email ✉️',
    html: baseTemplate(`
      <h2 style="margin-top:0">Welcome, ${user.firstName}! 👋</h2>
      <p>Thanks for signing up to FunSpace. Please verify your email address to get started.</p>
      <a href="${url}" class="btn">Verify Email Address</a>
      <p style="color:#6b7280;font-size:13px">This link expires in 24 hours. If you didn't create an account, you can safely ignore this email.</p>
    `),
  });
};

// Password reset
exports.sendPasswordResetEmail = async (user, token) => {
  const url = `${process.env.CLIENT_URL}/reset-password?token=${token}`;
  await sendEmail({
    to: user.email,
    subject: 'Reset your FunSpace password 🔒',
    html: baseTemplate(`
      <h2 style="margin-top:0">Password Reset Request</h2>
      <p>Hi ${user.firstName}, we received a request to reset your password.</p>
      <a href="${url}" class="btn">Reset Password</a>
      <p style="color:#6b7280;font-size:13px">This link expires in 1 hour. If you didn't request this, please ignore this email — your password won't change.</p>
    `),
  });
};

// Booking request to landlord
exports.sendBookingRequestEmail = async (landlord, tenant, booking, listing) => {
  await sendEmail({
    to: landlord.email,
    subject: `New booking request for "${listing.title}" 🏠`,
    html: baseTemplate(`
      <h2 style="margin-top:0">New Booking Request</h2>
      <p>Hi ${landlord.firstName}, you have a new booking request from <strong>${tenant.fullName}</strong>.</p>
      <hr class="divider">
      <p><strong>Property:</strong> ${listing.title}</p>
      <p><strong>Duration:</strong> ${booking.duration} semester(s)</p>
      <p><strong>Move-in:</strong> ${new Date(booking.moveInDate).toDateString()}</p>
      <p><strong>Total:</strong> ₦${booking.pricing.total.toLocaleString()}</p>
      <hr class="divider">
      <p>Please log in to your FunSpace dashboard to confirm or decline this request.</p>
      <a href="${process.env.CLIENT_URL}/dashboard/bookings" class="btn">View Request</a>
    `),
  });
};

// Booking confirmed to tenant
exports.sendBookingConfirmedEmail = async (tenant, booking, listing) => {
  await sendEmail({
    to: tenant.email,
    subject: `Booking confirmed for "${listing.title}" ✅`,
    html: baseTemplate(`
      <h2 style="margin-top:0">Your Booking is Confirmed! 🎉</h2>
      <p>Great news, ${tenant.firstName}! Your booking request has been <strong>accepted</strong> by the landlord.</p>
      <hr class="divider">
      <p><strong>Property:</strong> ${listing.title}</p>
      <p><strong>Address:</strong> ${listing.location.address}</p>
      <p><strong>Duration:</strong> ${booking.duration} semester(s)</p>
      <p><strong>Move-in:</strong> ${new Date(booking.moveInDate).toDateString()}</p>
      <p><strong>Total to pay:</strong> ₦${booking.pricing.total.toLocaleString()}</p>
      <hr class="divider">
      <p>Please complete your payment to secure the space.</p>
      <a href="${process.env.CLIENT_URL}/bookings/${booking._id}/pay" class="btn">Complete Payment</a>
    `),
  });
};

// Booking rejected
exports.sendBookingRejectedEmail = async (tenant, listing, reason) => {
  await sendEmail({
    to: tenant.email,
    subject: `Booking update for "${listing.title}"`,
    html: baseTemplate(`
      <h2 style="margin-top:0">Booking Not Available</h2>
      <p>Hi ${tenant.firstName}, unfortunately the landlord was unable to accept your booking for <strong>"${listing.title}"</strong>.</p>
      ${reason ? `<p><strong>Reason:</strong> ${reason}</p>` : ''}
      <p>Don't worry — there are many other great listings on FunSpace!</p>
      <a href="${process.env.CLIENT_URL}/explore" class="btn">Browse Listings</a>
    `),
  });
};

// Payment receipt
exports.sendPaymentReceiptEmail = async (tenant, booking, listing) => {
  await sendEmail({
    to: tenant.email,
    subject: `Payment receipt — ₦${booking.pricing.total.toLocaleString()} 🧾`,
    html: baseTemplate(`
      <h2 style="margin-top:0">Payment Successful 💚</h2>
      <p>Hi ${tenant.firstName}, your payment of <strong>₦${booking.pricing.total.toLocaleString()}</strong> has been received.</p>
      <hr class="divider">
      <p><strong>Property:</strong> ${listing.title}</p>
      <p><strong>Reference:</strong> ${booking.payment.reference}</p>
      <p><strong>Date:</strong> ${new Date(booking.payment.paidAt).toDateString()}</p>
      <p><strong>Breakdown:</strong></p>
      <ul>
        <li>Rent (${booking.duration} sem): ₦${booking.pricing.subtotal.toLocaleString()}</li>
        <li>Service fee: ₦${booking.pricing.serviceFee.toLocaleString()}</li>
        <li>Caution deposit: ₦${booking.pricing.cautionDeposit.toLocaleString()}</li>
      </ul>
      <hr class="divider">
      <p style="color:#6b7280;font-size:13px">Keep this email as your payment receipt. Contact the landlord to arrange move-in details.</p>
    `),
  });
};
