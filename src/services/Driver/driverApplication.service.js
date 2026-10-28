'use strict';

const { User, DriverProfile } = require('../../models');
const roleApiError = require('../../utils/auth/roleApiError');
const { toUserSummary } = require('../shared/user.service');
const { runInTransaction } = require('../../utils/shared/runInTransaction');

const SNAPSHOT_QUERY = {
  'submission.phone': { $type: 'string', $ne: '' },
  'submission.username': { $type: 'string', $ne: '' },
  'submission.fullName': { $type: 'string', $ne: '' },
  'submission.licenseNumber': { $type: 'string', $ne: '' },
  'submission.vehicleDescription': { $type: 'string', $ne: '' },
  submittedAt: { $type: 'date' },
};

function notFound() {
  return roleApiError(404, 'Driver application not found.', 'APPLICATION_NOT_FOUND');
}

function accountFilter(userId, role, activeOnly) {
  const filter = {
    _id: userId,
    role,
    isDeleted: { $ne: true },
    status: activeOnly ? 'active' : { $ne: 'deleted' },
  };
  return filter;
}

async function applicationById(applicationId, session = null) {
  let query = DriverProfile.findById(applicationId);
  if (session) {
    query = query.session(session);
  }
  const profile = await query;
  if (!profile || !profile.submission || !profile.submittedAt) {
    throw notFound();
  }
  let userQuery = User.findOne(accountFilter(profile.user, 'driver', false));
  if (session) {
    userQuery = userQuery.session(session);
  }
  const user = await userQuery;
  if (!user) {
    throw notFound();
  }
  return { user, profile };
}

async function listApplications({ page, limit }) {
  let applicationPage;
  await runInTransaction(async (session) => {
      const [aggregate] = await DriverProfile.aggregate([
        { $match: { verificationStatus: 'pending', ...SNAPSHOT_QUERY } },
        {
          $lookup: {
            from: 'users',
            localField: 'user',
            foreignField: '_id',
            as: 'user',
          },
        },
        { $unwind: '$user' },
        {
          $match: {
            'user.role': 'driver',
            'user.isDeleted': { $ne: true },
            'user.status': { $ne: 'deleted' },
          },
        },
        { $sort: { submittedAt: 1, _id: 1 } },
        {
          $facet: {
            applications: [{ $skip: (page - 1) * limit }, { $limit: limit }],
            total: [{ $count: 'value' }],
          },
        },
      ]).session(session);
      const total = aggregate.total[0]?.value || 0;
      applicationPage = {
        applications: aggregate.applications.map(({ user, ...profile }) =>
          toAdminDriverApplication(user, profile)
        ),
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      };
  }, { readConcern: { level: 'snapshot' } });
  return applicationPage;
}

async function getApplication(applicationId) {
  const { user, profile } = await applicationById(applicationId);
  return { application: toAdminDriverApplication(user, profile) };
}

async function incrementAccountGuard(userId, role, session, activeOnly) {
  const updateResult = await User.updateOne(
    accountFilter(userId, role, activeOnly),
    { $inc: { authRevision: 1 } },
    { session }
  );
  return updateResult.matchedCount === 1;
}

function decisionFields(decision, reviewerId, now) {
  const outcome = decision.decision === 'approve' ? 'approved' : 'rejected';
  return {
    outcome,
    reviewedBy: reviewerId,
    reviewedAt: now,
    rejectionReason: outcome === 'rejected' ? decision.reason : null,
  };
}

async function decideApplication(applicationId, reviewerId, decision) {
  const reviewedAt = new Date();
  let application;
  let currentDecision = false;
  await runInTransaction(async (session) => {
      if (!(await incrementAccountGuard(reviewerId, 'admin', session, true))) {
        throw roleApiError(401, 'Current admin account is unavailable.', 'INVALID_CREDENTIALS');
      }
      const records = await applicationById(applicationId, session);
      if (!(await incrementAccountGuard(records.user._id, 'driver', session, false))) {
        throw notFound();
      }
      if (records.profile.decision || records.profile.verificationStatus !== 'pending') {
        currentDecision = true;
        application = toAdminDriverApplication(records.user, records.profile);
        return;
      }

      const status = decision.decision === 'approve' ? 'verified' : 'rejected';
      const profile = await DriverProfile.findOneAndUpdate(
        {
          _id: applicationId,
          user: records.user._id,
          verificationStatus: 'pending',
          decision: null,
          ...SNAPSHOT_QUERY,
        },
        {
          $set: {
            verificationStatus: status,
            verifiedAt: status === 'verified' ? reviewedAt : null,
            decision: decisionFields(decision, reviewerId, reviewedAt),
          },
        },
        { session, returnDocument: 'after', runValidators: true }
      );
      if (!profile) {
        const current = await applicationById(applicationId, session);
        currentDecision = true;
        application = toAdminDriverApplication(current.user, current.profile);
        return;
      }
      application = toAdminDriverApplication(records.user, profile);
  });
  if (currentDecision) {
    throw roleApiError(409, 'Application already has a final decision.', 'APPLICATION_ALREADY_DECIDED', {
      application,
    });
  }
  return { application };
}

function toAdminDriverApplication(user, profile) {
  const decision = profile.decision
    ? {
        outcome: profile.decision.outcome,
        reviewedBy: profile.decision.reviewedBy
          ? String(profile.decision.reviewedBy._id || profile.decision.reviewedBy)
          : null,
        reviewedAt: profile.decision.reviewedAt ?? null,
        rejectionReason: profile.decision.rejectionReason ?? null,
      }
    : null;

  return {
    id: String(profile._id),
    user: toUserSummary(user),
    submission: profile.submission
      ? {
          phone: profile.submission.phone,
          username: profile.submission.username,
          fullName: profile.submission.fullName,
          licenseNumber: profile.submission.licenseNumber,
          vehicleDescription: profile.submission.vehicleDescription,
        }
      : null,
    submittedAt: profile.submittedAt ?? null,
    applicationSource: profile.applicationSource || 'legacy',
    verificationStatus: profile.verificationStatus,
    verifiedAt: profile.verifiedAt ?? null,
    decision,
  };
}

module.exports = {
  listApplications,
  getApplication,
  decideApplication,
  toAdminDriverApplication,
};
