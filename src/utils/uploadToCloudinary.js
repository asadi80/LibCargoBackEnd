const cloudinary = require("../config/cloudinary");

const uploadToCloudinary = (fileBuffer, folder = "libcargo") => {
  return new Promise((resolve, reject) => {
    cloudinary.uploader.upload_stream(
      {
        folder,
      },
      (error, result) => {
        if (error) return reject(error);
        resolve(result);
      }
    ).end(fileBuffer);
  });
};

const uploadDocuments = async (req, res) => {
  try {
    const license = req.files.licenseUrl?.[0];
    const insurance = req.files.insuranceUrl?.[0];

    const licenseUpload = license
      ? await uploadToCloudinary(license.buffer, "docs")
      : null;

    const insuranceUpload = insurance
      ? await uploadToCloudinary(insurance.buffer, "docs")
      : null;

    res.json({
      success: true,
      licenseUrl: licenseUpload?.secure_url,
      insuranceUrl: insuranceUpload?.secure_url,
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

module.exports = uploadToCloudinary;