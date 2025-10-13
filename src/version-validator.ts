/**
 * Version Validator for Godot 4.5+
 * 
 * This module provides version validation and compatibility checking
 * for Godot Engine, ensuring minimum version requirements are met.
 */

export interface GodotVersion {
  major: number;
  minor: number;
  patch: number;
  status?: string; // e.g., "stable", "beta", "rc1"
  full: string;
}

export interface VersionRequirement {
  minimum: GodotVersion;
  recommended?: GodotVersion;
}

/**
 * VersionValidator class for checking Godot version compatibility
 */
export class VersionValidator {
  private static readonly MINIMUM_VERSION: GodotVersion = {
    major: 4,
    minor: 5,
    patch: 0,
    full: '4.5.0',
  };

  /**
   * Parse a Godot version string into a structured version object
   * @param versionString Version string from Godot (e.g., "4.5.0.stable.official")
   * @returns Parsed GodotVersion object or null if parsing fails
   */
  static parseVersion(versionString: string): GodotVersion | null {
    if (!versionString || typeof versionString !== 'string') {
      return null;
    }

    // Godot version format can be:
    // - "4.5.0.stable.official" (with patch)
    // - "4.5.stable.official" (without patch - defaults to 0)
    // - "4.5.0-stable" (with dash separator)
    // Extract the numeric version part
    const versionMatch = versionString.match(/^(\d+)\.(\d+)(?:\.(\d+))?/);
    
    if (!versionMatch) {
      return null;
    }

    const major = parseInt(versionMatch[1], 10);
    const minor = parseInt(versionMatch[2], 10);
    const patch = versionMatch[3] ? parseInt(versionMatch[3], 10) : 0; // Default to 0 if not present

    // Extract status (stable, beta, rc, etc.)
    const statusMatch = versionString.match(/\.(stable|beta|rc\d+|alpha|dev)/i);
    const status = statusMatch ? statusMatch[1] : undefined;

    return {
      major,
      minor,
      patch,
      status,
      full: versionString,
    };
  }

  /**
   * Compare two versions
   * @returns -1 if v1 < v2, 0 if v1 === v2, 1 if v1 > v2
   */
  static compareVersions(v1: GodotVersion, v2: GodotVersion): number {
    if (v1.major !== v2.major) {
      return v1.major > v2.major ? 1 : -1;
    }
    if (v1.minor !== v2.minor) {
      return v1.minor > v2.minor ? 1 : -1;
    }
    if (v1.patch !== v2.patch) {
      return v1.patch > v2.patch ? 1 : -1;
    }
    return 0;
  }

  /**
   * Check if a version meets the minimum requirement
   * @param version Version to check
   * @param minimum Minimum required version (defaults to 4.5.0)
   * @returns True if version meets or exceeds minimum
   */
  static meetsMinimumVersion(
    version: GodotVersion,
    minimum: GodotVersion = VersionValidator.MINIMUM_VERSION
  ): boolean {
    return VersionValidator.compareVersions(version, minimum) >= 0;
  }

  /**
   * Validate a Godot version string against minimum requirements
   * @param versionString Version string to validate
   * @returns Validation result with details
   */
  static validate(versionString: string): {
    valid: boolean;
    version: GodotVersion | null;
    message: string;
  } {
    const version = VersionValidator.parseVersion(versionString);

    if (!version) {
      return {
        valid: false,
        version: null,
        message: `Invalid version string: "${versionString}". Expected format: "X.Y.Z" (e.g., "4.5.0")`,
      };
    }

    const meetsMinimum = VersionValidator.meetsMinimumVersion(version);

    if (!meetsMinimum) {
      return {
        valid: false,
        version,
        message: `Godot version ${version.major}.${version.minor}.${version.patch} does not meet minimum requirement of ${VersionValidator.MINIMUM_VERSION.major}.${VersionValidator.MINIMUM_VERSION.minor}.${VersionValidator.MINIMUM_VERSION.patch}. Please upgrade to Godot 4.5.0 or later.`,
      };
    }

    return {
      valid: true,
      version,
      message: `Godot version ${version.major}.${version.minor}.${version.patch} is compatible.`,
    };
  }

  /**
   * Get the minimum required version
   */
  static getMinimumVersion(): GodotVersion {
    return { ...VersionValidator.MINIMUM_VERSION };
  }

  /**
   * Check if a version supports specific Godot 4.5+ features
   * @param version Version to check
   * @returns Object indicating which features are supported
   */
  static getSupportedFeatures(version: GodotVersion): {
    uidSystem: boolean;
    compositorEffects: boolean;
    enhancedPhysics: boolean;
    improvedGDScript: boolean;
    modernNodeTypes: boolean;
  } {
    const is45OrLater = VersionValidator.compareVersions(version, {
      major: 4,
      minor: 5,
      patch: 0,
      full: '4.5.0',
    }) >= 0;

    const is44OrLater = VersionValidator.compareVersions(version, {
      major: 4,
      minor: 4,
      patch: 0,
      full: '4.4.0',
    }) >= 0;

    return {
      uidSystem: is44OrLater, // UID system introduced in 4.4
      compositorEffects: is45OrLater, // Compositor system in 4.5+
      enhancedPhysics: is45OrLater, // Enhanced physics in 4.5+
      improvedGDScript: is45OrLater, // Improved GDScript parser in 4.5+
      modernNodeTypes: is45OrLater, // Modern node types in 4.5+
    };
  }

  /**
   * Format a version object as a string
   */
  static formatVersion(version: GodotVersion): string {
    let formatted = `${version.major}.${version.minor}.${version.patch}`;
    if (version.status) {
      formatted += `.${version.status}`;
    }
    return formatted;
  }
}
