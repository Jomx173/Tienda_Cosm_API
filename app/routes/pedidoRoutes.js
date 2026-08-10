const express = require("express");
const router = express.Router();

const pedidoController = require("../controllers/pedidoController");
const { verificarToken } = require("../Middleware/auth");

router.post("/", pedidoController.crearPedido);
router.get("/", verificarToken, pedidoController.obtenerPedidos);
router.get("/:id", verificarToken, pedidoController.obtenerPedido);
router.put("/:id/estado", verificarToken, pedidoController.actualizarEstadoPedido);
router.delete("/:id", verificarToken, pedidoController.eliminarPedido);

module.exports = router;
