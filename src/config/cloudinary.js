const cloudinary = require('cloudinary').v2;

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME || 'x8vpeeyg',
  api_key: process.env.CLOUDINARY_API_KEY || '514657785747719',
  api_secret: process.env.CLOUDINARY_API_SECRET || 'B-bivOg9g3p5K38a86dSz48TEWA',
  secure: true
});

/**
 * Upload a Buffer to Cloudinary using upload_stream
 * @param {Buffer} fileBuffer
 * @param {string} folder
 * @returns {Promise<Object>}
 */
const uploadToCloudinary = (fileBuffer, folder = 'moffin_vendors/profile_photos') => {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder,
        resource_type: 'image',
        transformation: [
          { width: 500, height: 500, crop: 'limit' },
          { quality: 'auto' },
          { fetch_format: 'auto' }
        ]
      },
      (error, result) => {
        if (error) return reject(error);
        resolve(result);
      }
    );
    stream.end(fileBuffer);
  });
};

module.exports = {
  cloudinary,
  uploadToCloudinary
};
