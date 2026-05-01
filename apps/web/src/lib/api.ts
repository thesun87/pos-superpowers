"use client";
import { useMemo } from "react";
import { ApiClient } from "./api-client";
import { loadPublicEnv } from "./env";
import { useAuth } from "@/providers/auth-provider";

export function useApiClient(): ApiClient {
  const { accessToken } = useAuth();
  return useMemo(() => {
    const { NEXT_PUBLIC_API_URL } = loadPublicEnv();
    return new ApiClient({
      baseUrl: NEXT_PUBLIC_API_URL,
      getToken: () => accessToken
    });
  }, [accessToken]);
}
