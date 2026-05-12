# Auth Service API Contracts

## Authentication endpoints

### POST /auth/register
Request:
- email: string
- phone: string
- password: string
- role: string

Response:
- user: { id, email, phone, role }

### POST /auth/login
Request:
- emailOrPhone: string
- password: string
- deviceName?: string
- platform?: string

Response:
- accessToken: string
- refreshToken: string
- expiresIn: string
- role: string

### POST /auth/refresh
Request:
- refreshToken: string

Response:
- accessToken: string
- expiresIn: string

### POST /auth/logout
Request:
- refreshToken: string

Response:
- success: boolean

### GET /auth/me
Response:
- user: { id, email, role, tenantId }

### POST /auth/otp/request
Request:
- target: string
- type: email|phone
- channel: login|verification

Response:
- message: string
- target: string
- expirySeconds: number

### POST /auth/otp/verify
Request:
- target: string
- type: email|phone
- otpCode: string

Response:
- success: boolean
- verified: boolean

### GET /auth/sessions
Response:
- sessions: [ { id, device_id, ip, user_agent, last_seen_at, created_at } ]

### GET /auth/devices
Response:
- devices: [ { id, name, platform, last_seen_at, created_at } ]

## Admin endpoints

### POST /admin/ip-whitelist
Request:
- label: string
- ipCidr: string

Response:
- success: boolean

### POST /admin/geo-restrictions
Request:
- label: string
- countryCode: string
- action: block|monitor

Response:
- success: boolean

### GET /admin/audit-logs
Response:
- auditLogs: [ { id, user_id, action, entity, ip, user_agent, payload, created_at } ]

### GET /admin/users
Response:
- users: [ { id, email, phone, role, is_email_verified, is_phone_verified, is_enabled, created_at } ]
