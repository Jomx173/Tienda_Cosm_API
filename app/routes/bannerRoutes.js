const express = require("express");
const router = express.Router();

const bannerController = require("../controllers/bannerController");
const upload = require("../Middleware/upload");
const { verificarToken } = require("../Middleware/auth");

router.get("/", bannerController.obtenerBanners);
router.get("/:id", bannerController.obtenerBanner);
router.post("/", verificarToken, upload.single("imagen"), bannerController.crearBanner);
router.put("/:id", verificarToken, upload.single("imagen"), bannerController.actualizarBanner);
router.delete("/:id", verificarToken, bannerController.eliminarBanner);

module.exports = router;
