import * as vscode from "vscode";
import { getConfigValue } from "../services/config";

/**
 * OPTIONAL cloud sync scaffolding (Google OAuth + Supabase).
 *
 * This module is intentionally inert by default. It provides typed stubs and a
 * clear extension point so a deployment can wire real credentials without
 * touching core logic. NOTHING here runs unless `inai.cloud.enabled` is
 * true AND credentials are provided. There is no bundled backend; see
 * docs/IMPLEMENTATION_PLAN.md and README "Optional Cloud Sync" for setup.
 *
 * No network calls are made in this file. Enabling requires the integrator to
 * supply a Supabase URL/key and a Google OAuth client, documented in README.
 */

export interface CloudConfig {
  enabled: boolean;
  supabaseUrl?: string;
  supabaseAnonKey?: string;
  googleClientId?: string;
}

export interface CloudUser {
  id: string;
  email?: string;
}

export class CloudSync {
  constructor(private readonly secrets: vscode.SecretStorage) {}

  /** Read config; disabled unless explicitly enabled by the integrator. */
  config(): CloudConfig {
    return {
      enabled: getConfigValue<boolean>("cloud.enabled", false),
      supabaseUrl: getConfigValue<string>("cloud.supabaseUrl", "") || undefined,
      googleClientId:
        getConfigValue<string>("cloud.googleClientId", "") || undefined,
    };
  }

  isConfigured(): boolean {
    const c = this.config();
    return Boolean(c.enabled && c.supabaseUrl && c.googleClientId);
  }

  /**
   * Begin Google OAuth via VS Code's authentication API. This is a scaffold:
   * it surfaces a clear message when not configured rather than pretending to
   * authenticate.
   */
  async signIn(): Promise<CloudUser | undefined> {
    if (!this.isConfigured()) {
      void vscode.window.showInformationMessage(
        "INAI cloud sync is optional and not configured. See README → Optional Cloud Sync.",
      );
      return undefined;
    }
    // Integration point: exchange Google OAuth token with Supabase auth.
    // Left unimplemented on purpose — requires integrator-provided backend.
    void vscode.window.showWarningMessage(
      "Cloud sync is configured but the backend integration is not bundled. See setup docs.",
    );
    return undefined;
  }

  /** Persist a sync token if/when a real backend is wired. */
  async storeToken(token: string): Promise<void> {
    await this.secrets.store("inai.cloud.token", token);
  }
}
