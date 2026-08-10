const express = require("express");
const router = express.Router();

const productoController = require("../controllers/productoController");
const upload = require("../Middleware/upload");
const { verificarToken } = require("../Middleware/auth");

router.get("/", productoController.obtenerProductos);
router.get("/:id", productoController.obtenerProducto);
router.post("/", verificarToken, upload.single("imagen"), productoController.crearProducto);
router.put("/:id", verificarToken, upload.single("imagen"), productoController.actualizarProducto);
router.delete("/:id", verificarToken, productoController.eliminarProducto);

module.exports = router;
