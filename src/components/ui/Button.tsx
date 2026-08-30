"use client";

import { forwardRef, type ButtonHTMLAttributes } from "react";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost" | "danger" | "success" | "outline" | "telegram";
  size?: "sm" | "md" | "lg" | "icon";
  isLoading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  fullWidth?: boolean;
  children: React.ReactNode;
}

const variantClasses = {
  primary: "btn btn-primary",
  secondary: "btn btn-secondary",
  ghost: "btn btn-ghost",
  danger: "btn btn-danger",
  success: "btn btn-success",
  outline: "btn btn-outline",
  telegram: "btn btn-telegram",
};

const sizeClasses = {
  sm: "btn-sm",
  md: "",
  lg: "btn-lg",
  icon: "btn-icon",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      children,
      variant = "primary",
      size = "md",
      isLoading = false,
      leftIcon,
      rightIcon,
      fullWidth = false,
      disabled,
      className: classNameProp = "",
      onClick,
      type = "button",
      ...props
    },
    ref
  ) => {
    const baseClasses = `inline-flex items-center justify-center gap-2 font-semibold transition-all duration-200 select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terminal-accent/50 focus-visible:ring-offset-2 focus-visible:ring-offset-terminal-bg active:scale-[0.97] ${
      fullWidth ? "w-full" : ""
    }`;

    const className = `${baseClasses} ${variantClasses[variant]} ${sizeClasses[size]} ${classNameProp}`;

    return (
      <button
        ref={ref}
        type={type}
        disabled={disabled || isLoading}
        onClick={onClick}
        className={className}
        {...props}
      >
        {isLoading && (
          <svg
            className="h-4 w-4 animate-spin"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={2}
            stroke="currentColor"
          >
            <circle className="opacity-25" cx="12" cy="12" r="10" strokeWidth="2" />
            <path className="opacity-75" d="M12 2a10 10 0 0110 10" strokeLinecap="round" />
          </svg>
        )}
        {!isLoading && leftIcon && <span className="flex-shrink-0">{leftIcon}</span>}
        <span>{children}</span>
        {!isLoading && rightIcon && <span className="flex-shrink-0">{rightIcon}</span>}
      </button>
    );
  }
);

Button.displayName = "Button";
