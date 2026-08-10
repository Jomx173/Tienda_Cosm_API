const express = require("express");
const router = express.Router();

const categoriaController = require("../controllers/categoriaController");
const { verificarToken } = require("../Middleware/auth");

router.get("/", categoriaController.obtenerCategorias);
router.get("/:id", categoriaController.obtenerCategoria);
router.post("/", verificarToken, categoriaController.crearCategoria);
router.put("/:id", verificarToken, categoriaController.actualizarCategoria);
router.delete("/:id", verificarToken, categoriaController.eliminarCategoria);

module.exports = router;
