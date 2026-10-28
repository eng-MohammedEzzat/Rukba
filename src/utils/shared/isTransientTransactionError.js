'use strict';

function isTransientTransactionError(error) {
  return Boolean(
    error?.hasErrorLabel?.('TransientTransactionError')
    || error?.hasErrorLabel?.('UnknownTransactionCommitResult')
    || error?.errorLabels?.includes?.('TransientTransactionError')
    || error?.codeName === 'SnapshotUnavailable'
    || error?.code === 246
  );
}

module.exports = isTransientTransactionError;
