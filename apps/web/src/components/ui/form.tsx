"use client";
import * as React from "react";
import {
  Controller,
  type ControllerProps,
  type FieldPath,
  type FieldValues,
  FormProvider,
  useFormContext
} from "react-hook-form";
import { Label } from "./label";
import { cn } from "@/lib/utils";

export const Form = FormProvider;

interface FormFieldContextValue<
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>
> {
  name: TName;
}

const FormFieldContext = React.createContext<FormFieldContextValue | null>(null);

export const FormField = <
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>
>(
  props: ControllerProps<TFieldValues, TName>
) => (
  <FormFieldContext.Provider value={{ name: props.name }}>
    <Controller {...props} />
  </FormFieldContext.Provider>
);

export const FormItem = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("space-y-2", className)} {...props} />
);

export const FormLabel = ({
  className,
  ...props
}: React.LabelHTMLAttributes<HTMLLabelElement>) => (
  <Label className={cn(className)} {...props} />
);

export const FormControl = ({ children }: { children: React.ReactNode }) => <>{children}</>;

export const FormMessage = ({ className }: { className?: string }) => {
  const ctx = React.useContext(FormFieldContext);
  const { formState } = useFormContext();
  const error = ctx ? (formState.errors[ctx.name] as { message?: string } | undefined) : undefined;
  if (!error?.message) return null;
  return <p className={cn("text-sm text-destructive", className)}>{error.message}</p>;
};
