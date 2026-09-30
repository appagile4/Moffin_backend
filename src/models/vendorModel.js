const mongoose = require('mongoose');

/**
 * Bank Account Subdocument Schema
 */
const bankAccountSchema = new mongoose.Schema(
  {
    accountNumber: {
      type: String,
      required: [true, 'Bank account number is required'],
      trim: true
    },
    ifscCode: {
      type: String,
      required: [true, 'IFSC code is required'],
      uppercase: true,
      trim: true
    },
    bankName: {
      type: String,
      required: [true, 'Bank name is required'],
      trim: true
    },
    accountHolderName: {
      type: String,
      required: [true, 'Account holder name is required'],
      trim: true
    },
    branchName: {
      type: String,
      required: [true, 'Branch name is required'],
      trim: true
    },
    isDefault: {
      type: Boolean,
      default: false
    }
  },
  {
    _id: true,
    timestamps: true
  }
);

/**
 * Wallet Subdocument Schema
 */
const walletSchema = new mongoose.Schema(
  {
    walletName: {
      type: String,
      required: [true, 'Wallet name is required'],
      trim: true
    },
    walletId: {
      type: String,
      required: [true, 'Wallet ID/Address is required'],
      trim: true
    },
    qrCode: {
      type: String,
      trim: true,
      default: null
    },
    isDefault: {
      type: Boolean,
      default: false
    }
  },
  {
    _id: true,
    timestamps: true
  }
);

/**
 * Vendor Main Schema
 */
const vendorSchema = new mongoose.Schema(
  {
    // 1. Personal Information
    firstName: {
      type: String,
      required: [true, 'First name is required'],
      trim: true
    },
    lastName: {
      type: String,
      required: [true, 'Last name is required'],
      trim: true
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
      match: [
        /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
        'Please provide a valid email address'
      ]
    },
    password: {
      type: String,
      required: [true, 'Password is required'],
      select: false // Excluded from default queries for security
    },
    mobileNumber: {
      type: String,
      required: [true, 'Mobile number is required'],
      trim: true
    },
    whatsappNumber: {
      type: String,
      trim: true,
      default: null
    },
    telegramId: {
      type: String,
      trim: true,
      default: null
    },
    profilePhoto: {
      type: String,
      trim: true,
      default: null
    },
    document: {
      type: String,
      trim: true,
      default: null
    },

    // 2. Bank Accounts & Wallets (1-to-many embedded subdocuments)
    bankAccounts: {
      type: [bankAccountSchema],
      default: []
    },
    wallets: {
      type: [walletSchema],
      default: []
    },

    // 3. SuperAdmin Management & Status Fields
    verificationStatus: {
      type: String,
      enum: {
        values: ['pending', 'approved', 'rejected'],
        message: '{VALUE} is not a valid verification status'
      },
      default: 'pending',
      index: true
    },
    rejectionReason: {
      type: String,
      trim: true,
      default: null
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true
    }
  },
  {
    timestamps: true,
    versionKey: false
  }
);

// Secondary Indexes for fast lookups
vendorSchema.index({ mobileNumber: 1 });
vendorSchema.index({ verificationStatus: 1, isActive: 1 });

const Vendor = mongoose.model('Vendor', vendorSchema);

module.exports = Vendor;
