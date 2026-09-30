const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const Admin = require('../models/adminModel');

/**
 * Generate JWT for Admin
 */
const generateAdminToken = (admin) => {
  return jwt.sign(
    { id: admin._id, role: admin.role, email: admin.email },
    process.env.JWT_SECRET || 'moffin_jwt_secret_key_default_2026',
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
};

/**
 * @desc    SuperAdmin / Admin Login (No registration endpoint)
 * @route   POST /api/admin/login
 * @access  Public
 */
const adminLogin = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Please provide both email and password'
      });
    }

    const cleanEmail = email.toLowerCase().trim();

    // Fetch admin with password
    const admin = await Admin.findOne({ email: cleanEmail }).select('+password');
    if (!admin) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    if (!admin.isActive) {
      return res.status(403).json({
        success: false,
        message: 'Your administrator account has been deactivated'
      });
    }

    const isMatch = await bcrypt.compare(password, admin.password);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    const token = generateAdminToken(admin);

    const safeAdmin = admin.toObject();
    delete safeAdmin.password;

    return res.status(200).json({
      success: true,
      message: 'SuperAdmin login successful',
      data: {
        token,
        admin: safeAdmin
      }
    });
  } catch (error) {
    console.error('adminLogin Error:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Internal server error during admin login'
    });
  }
};

/**
 * @desc    Get authenticated Admin profile
 * @route   GET /api/admin/me
 * @access  Private (Admin / SuperAdmin)
 */
const getAdminProfile = async (req, res) => {
  try {
    const admin = await Admin.findById(req.user.id);
    if (!admin) {
      return res.status(404).json({
        success: false,
        message: 'Admin account not found'
      });
    }

    return res.status(200).json({
      success: true,
      data: { admin }
    });
  } catch (error) {
    console.error('getAdminProfile Error:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Error fetching admin profile'
    });
  }
};

/**
 * Helper: Seed default SuperAdmin if none exists
 */
const seedSuperAdmin = async () => {
  try {
    const adminCount = await Admin.countDocuments();
    if (adminCount === 0) {
      const defaultEmail = process.env.ADMIN_EMAIL || 'admin@moffin.com';
      const defaultPassword = process.env.ADMIN_PASSWORD || 'Admin@123456';
      
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(defaultPassword, salt);

      await Admin.create({
        name: 'Super Administrator',
        email: defaultEmail.toLowerCase().trim(),
        password: hashedPassword,
        role: 'super_admin',
        isActive: true
      });

      console.log(`👑 Default SuperAdmin seeded: ${defaultEmail} | Password: ${defaultPassword}`);
    }
  } catch (error) {
    console.error('SuperAdmin seed error:', error.message);
  }
};

module.exports = {
  adminLogin,
  getAdminProfile,
  seedSuperAdmin
};
