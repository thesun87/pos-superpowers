import { Injectable, type OnModuleDestroy } from "@nestjs/common";
import { AsyncLocalStorage } from "node:async_hooks";

interface TenantContext {
  tenantId: string | null;
}

@Injectable()
export class TenantService implements OnModuleDestroy {
  private readonly asyncLocalStorage = new AsyncLocalStorage<TenantContext>();

  async set(tenantId: string): Promise<void> {
    this.asyncLocalStorage.enterWith({ tenantId });
  }

  async clear(): Promise<void> {
    this.asyncLocalStorage.enterWith({ tenantId: null });
  }

  get(): string | null {
    const store = this.asyncLocalStorage.getStore();
    if (!store) {
      throw new Error("No tenant context");
    }
    return store.tenantId;
  }

  getTenantId(): string {
    const tenantId = this.get();
    if (!tenantId) {
      throw new Error("No tenant context");
    }
    return tenantId;
  }

  onModuleDestroy(): void {
    this.asyncLocalStorage.disable();
  }
}
