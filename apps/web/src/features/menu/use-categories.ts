"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CreateMenuCategoryRequestSchema,
  MenuCategoryListResponseSchema,
  MenuCategorySchema,
  UpdateMenuCategoryRequestSchema,
  type CreateMenuCategoryRequest,
  type UpdateMenuCategoryRequest
} from "@pos/contracts";
import { z } from "zod";
import { useApiClient } from "@/lib/api";

const CategoryResponseSchema = z.object({ data: MenuCategorySchema });

export function useCategories() {
  const client = useApiClient();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["menu-categories"],
    queryFn: async () => {
      const res = await client.request("/menu/categories", {
        method: "GET",
        responseSchema: MenuCategoryListResponseSchema
      });
      return res?.data ?? [];
    }
  });

  const create = useMutation({
    mutationFn: async (input: CreateMenuCategoryRequest) => {
      const body = CreateMenuCategoryRequestSchema.parse(input);
      const res = await client.request("/menu/categories", {
        method: "POST",
        body,
        responseSchema: CategoryResponseSchema
      });
      return res?.data;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["menu-categories"] });
    }
  });

  const update = useMutation({
    mutationFn: async ({
      id,
      input
    }: {
      id: string;
      input: UpdateMenuCategoryRequest;
    }) => {
      const body = UpdateMenuCategoryRequestSchema.parse(input);
      const res = await client.request(`/menu/categories/${id}`, {
        method: "PATCH",
        body,
        responseSchema: CategoryResponseSchema
      });
      return res?.data;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["menu-categories"] });
    }
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      await client.request(`/menu/categories/${id}`, {
        method: "DELETE",
        responseSchema: z.undefined()
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["menu-categories"] });
    }
  });

  return { query, create, update, remove };
}
