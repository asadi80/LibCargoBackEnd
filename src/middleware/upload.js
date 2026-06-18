const multer = require("multer");

// store file in memory (NOT disk)
const storage = multer.memoryStorage();

const upload = multer({
  storage,
});

module.exports = upload;