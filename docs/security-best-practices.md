# Auth and Security Best Practices

## JWT Authentication
- Use strong secrets and rotate them periodically.
- Keep access tokens short lived (`15m` recommended).
- Store refresh tokens securely and revoke them on logout or suspected compromise.
- Validate `aud`, `iss`, and `exp` claims in production.

## Refresh Tokens
- Persist refresh tokens in the database and cache them in Redis for fast lookup.
- Mark refresh tokens revoked when users log out or session anomalies are detected.
- Use rotating refresh tokens to reduce replay risk.

## Device Tracking
- Record device metadata and session sources with every login.
- Maintain a list of active devices and allow users to revoke stale sessions.
- Cross-check device attributes against historical logins for fraud detection.

## OTP and Verification
- Generate OTPs with sufficient entropy and store them with an expiration TTL.
- Send OTPs through verified channels and avoid logging secret codes.
- Use OTPs for email and phone verification as well as step-up authentication.

## Session Management
- Keep session state in Redis when fast revocation is required.
- Track session last activity and expire idle sessions after a reasonable window.
- Provide user-facing session history and remote logout controls.

## RBAC
- Assign roles to users and enforce access at the API layer.
- Keep role checks declarative and centralized in middleware.
- Use least-privilege defaults and restrict administrative access strongly.

## IP and Geo Restrictions
- Use IP whitelists for administrative APIs and partner integrations.
- Apply geo-based restrictions only when required by policy.
- Respect proxy headers securely by configuring trusted proxies.

## Rate Limiting
- Protect sensitive endpoints like login, OTP, and verification with rate limits.
- Use distributed rate limiting if requests are served from multiple nodes.
- Provide clear error messages and monitoring for blocked clients.

## Fraud Prevention
- Log login attempts and failed validation events.
- Flag unusual geo-location, device, or session behavior.
- Use audit trails to investigate suspicious actions and support compliance.

## Audit Logging
- Log every authentication event, policy change, and session action.
- Store audit records in an immutable append-only table.
- Retain audit data according to your compliance and data retention policies.
