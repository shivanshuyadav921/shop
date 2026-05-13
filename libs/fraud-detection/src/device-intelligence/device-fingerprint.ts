import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex } from '@noble/hashes/utils';
import { v4 as uuidv4 } from 'uuid';
import pino from 'pino';

/**
 * Device fingerprinting and intelligence
 * Identifies devices across sessions for fraud detection
 */

export interface DeviceFingerprint {
  deviceId: string;
  fingerprint: string;
  userAgent: string;
  osFamily: string;
  osVersion: string;
  browserFamily: string;
  browserVersion: string;
  ipAddress: string;
  geoLocation?: {
    latitude: number;
    longitude: number;
    city?: string;
    country?: string;
  };
  deviceProperties: {
    screenResolution: string;
    timezone: string;
    language: string;
    hasJavaScript: boolean;
    hasWebGL: boolean;
    hasWebRTC: boolean;
  };
  createdAt: Date;
  lastSeen: Date;
  riskScore: number; // 0-100
  isKnown: boolean;
}

export interface DeviceContext {
  deviceId: string;
  userId: string;
  transactionId: string;
  sessionToken: string;
  ipAddress: string;
  timestamp: Date;
  isNewDevice: boolean;
  isNewIp: boolean;
  isVpnLikely: boolean;
  isProxyLikely: boolean;
}

export class DeviceFingerprinter {
  private devices: Map<string, DeviceFingerprint> = new Map();
  private userDevices: Map<string, Set<string>> = new Map(); // user -> device IDs
  private sessionContexts: Map<string, DeviceContext> = new Map();
  private logger: pino.Logger;

  constructor(logger?: pino.Logger) {
    this.logger = logger || pino();
  }

  /**
   * Generate device fingerprint
   */
  generateFingerprint(rawData: any): string {
    const components = [
      rawData.userAgent,
      rawData.screenResolution,
      rawData.timezone,
      rawData.language,
      rawData.hasJavaScript ? '1' : '0',
      rawData.hasWebGL ? '1' : '0',
      rawData.hasWebRTC ? '1' : '0',
    ];

    const combined = components.join('|');
    return bytesToHex(sha256(Buffer.from(combined))).substring(0, 32);
  }

  /**
   * Register or identify device
   */
  identifyDevice(
    userId: string,
    fingerprint: string,
    ipAddress: string,
    rawData: any
  ): { deviceId: string; isNewDevice: boolean; context: DeviceContext } {
    // Check if device already known
    let deviceId: string | null = null;
    let isNewDevice = false;

    // Look up by fingerprint
    for (const [did, device] of this.devices) {
      if (device.fingerprint === fingerprint && device.isKnown) {
        deviceId = did;
        device.lastSeen = new Date();
        break;
      }
    }

    if (!deviceId) {
      // New device
      deviceId = `dev_${uuidv4()}`;
      isNewDevice = true;

      const userDeviceSet = this.userDevices.get(userId) || new Set();
      userDeviceSet.add(deviceId);
      this.userDevices.set(userId, userDeviceSet);

      this.logger.info(`New device identified for user ${userId}: ${deviceId}`);
    }

    // Create or update fingerprint record
    if (!this.devices.has(deviceId)) {
      const device: DeviceFingerprint = {
        deviceId,
        fingerprint,
        userAgent: rawData.userAgent || 'unknown',
        osFamily: this.parseOS(rawData.userAgent),
        osVersion: rawData.osVersion || 'unknown',
        browserFamily: this.parseBrowser(rawData.userAgent),
        browserVersion: rawData.browserVersion || 'unknown',
        ipAddress,
        geoLocation: rawData.geoLocation,
        deviceProperties: {
          screenResolution: rawData.screenResolution || 'unknown',
          timezone: rawData.timezone || 'UTC',
          language: rawData.language || 'en',
          hasJavaScript: rawData.hasJavaScript ?? true,
          hasWebGL: rawData.hasWebGL ?? false,
          hasWebRTC: rawData.hasWebRTC ?? false,
        },
        createdAt: new Date(),
        lastSeen: new Date(),
        riskScore: isNewDevice ? 35 : 20, // New devices have higher initial risk
        isKnown: false,
      };

      this.devices.set(deviceId, device);
    }

    // Create context
    const context: DeviceContext = {
      deviceId,
      userId,
      transactionId: rawData.transactionId || uuidv4(),
      sessionToken: uuidv4(),
      ipAddress,
      timestamp: new Date(),
      isNewDevice,
      isNewIp: this.isNewIpForUser(userId, ipAddress),
      isVpnLikely: this.detectVPN(ipAddress),
      isProxyLikely: this.detectProxy(ipAddress),
    };

    this.sessionContexts.set(context.sessionToken, context);

    return { deviceId, isNewDevice, context };
  }

  /**
   * Get known devices for user
   */
  getUserDevices(userId: string): DeviceFingerprint[] {
    const deviceIds = this.userDevices.get(userId) || new Set();
    const devices: DeviceFingerprint[] = [];

    for (const deviceId of deviceIds) {
      const device = this.devices.get(deviceId);
      if (device) {
        devices.push(device);
      }
    }

    return devices;
  }

  /**
   * Mark device as known/trusted
   */
  trustDevice(deviceId: string): void {
    const device = this.devices.get(deviceId);
    if (device) {
      device.isKnown = true;
      device.riskScore = Math.max(0, device.riskScore - 20);
      this.logger.info(`Marked device ${deviceId} as trusted`);
    }
  }

  private parseOS(userAgent: string): string {
    if (userAgent.includes('Windows')) return 'Windows';
    if (userAgent.includes('Mac')) return 'macOS';
    if (userAgent.includes('Linux')) return 'Linux';
    if (userAgent.includes('Android')) return 'Android';
    if (userAgent.includes('iPhone') || userAgent.includes('iPad')) return 'iOS';
    return 'Unknown';
  }

  private parseBrowser(userAgent: string): string {
    if (userAgent.includes('Chrome')) return 'Chrome';
    if (userAgent.includes('Safari')) return 'Safari';
    if (userAgent.includes('Firefox')) return 'Firefox';
    if (userAgent.includes('Edge')) return 'Edge';
    return 'Unknown';
  }

  private isNewIpForUser(userId: string, ipAddress: string): boolean {
    const devices = this.getUserDevices(userId);
    const seenIPs = new Set(devices.map((d) => d.ipAddress));
    return !seenIPs.has(ipAddress);
  }

  private detectVPN(ipAddress: string): boolean {
    // Would check against known VPN IP ranges
    return false;
  }

  private detectProxy(ipAddress: string): boolean {
    // Would check against proxy detection services
    return false;
  }
}

export default DeviceFingerprinter;
