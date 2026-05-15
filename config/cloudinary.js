const cloudinary = require('cloudinary').v2;

function initCloudinary() {
  const config = {
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key:    process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  };

  if (!config.cloud_name || !config.api_key || !config.api_secret) {
    console.warn('[cloudinary] 环境变量缺失，使用本地 fallback 存储');
    return null;
  }

  cloudinary.config(config);
  console.log(`[cloudinary] 已连接: ${config.cloud_name}`);
  return cloudinary;
}

function getCloudinary() {
  return cloudinary;
}

module.exports = { initCloudinary, getCloudinary };
