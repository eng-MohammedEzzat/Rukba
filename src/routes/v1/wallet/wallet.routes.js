'use strict';

const { Router } = require('express');
const walletController = require('../../../controllers/wallet/wallet.controller');
const authenticate = require('../../../middlewares/auth/auth.middleware');
const requireRole = require('../../../middlewares/auth/role.middleware');
const validate = require('../../../middlewares/shared/validate.middleware');
const {
  topUpSchema,
  listWalletTransactionsSchema,
} = require('../../../validators/wallet/wallet.validator');

const router = Router();

router.use(authenticate, requireRole('passenger'));

router.get('/', walletController.getWallet);
router.get(
  '/transactions',
  validate(listWalletTransactionsSchema, 'query'),
  walletController.listTransactions
);
router.post('/top-up', validate(topUpSchema), walletController.topUp);

module.exports = router;
