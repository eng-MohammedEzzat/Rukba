'use strict';

const { Router } = require('express');
const walletController = require('../../../controllers/wallet/wallet.controller');
const authenticate = require('../../../middlewares/auth/auth.middleware');
const requireRole = require('../../../middlewares/auth/role.middleware');
const requireEligibleDriver = require('../../../middlewares/trip/driverEligibility.middleware');
const validate = require('../../../middlewares/shared/validate.middleware');
const {
  payoutSchema,
  listWalletTransactionsSchema,
} = require('../../../validators/wallet/wallet.validator');

const router = Router();

router.use(authenticate, requireRole('driver'), requireEligibleDriver);

router.get('/', walletController.getWallet);
router.get(
  '/transactions',
  validate(listWalletTransactionsSchema, 'query'),
  walletController.listTransactions
);
router.post('/payouts', validate(payoutSchema), walletController.requestPayout);

module.exports = router;
