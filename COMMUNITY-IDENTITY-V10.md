# TCC Community v10 — Identity & Verification

Run `supabase/community_identity_v10.sql` after the existing Community migrations.

## Identity controls
- Each provisioned member receives a unique `TCC-######` member reference.
- A verified badge is available only when `member_access.status = active` and `identity_status = verified`.
- Every provision, verification, suspension, reactivation, revocation and profile update can be recorded in `community_identity_audit`.
- Admins can view the full audit stream; Department Heads are restricted to their department.

## Important
The member reference is an internal church identifier, not proof of legal identity. The church should verify membership using its own records/process before marking a member verified.
