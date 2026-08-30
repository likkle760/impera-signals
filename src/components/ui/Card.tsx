"use client";

import { forwardRef, type HTMLAttributes } from "react";

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: "default" | "elevated" | "glass" | "interactive";
  padding?: "none" | "sm" | "md" | "lg";
  hover?: boolean;
}

const variantClasses = {
  default: "card",
  elevated: "card-elevated",
  glass: "card-glass",
  interactive: "card card-interactive",
};

const paddingClasses = {
  none: "",
  sm: "p-3 sm:p-4",
  md: "p-5 sm:p-6",
  lg: "p-6 sm:p-8",
};

export const Card = forwardRef<HTMLDivElement, CardProps>(
  ({ children, variant = "default", padding = "md", hover = false, className = "", ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={`${variantClasses[variant]} ${paddingClasses[padding]} ${
          hover && variant === "interactive" ? "hover-lift hover-glow" : ""
        } ${className}`}
        {...props}
      >
        {children}
      </div>
    );
  }
);

Card.displayName = "Card";

export const CardHeader = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ children, className = "", ...props }, ref) => (
    <div ref={ref} className={`mb-4 ${className}`} {...props}>{children}</div>
  )
);
CardHeader.displayName = "CardHeader";

export const CardTitle = forwardRef<HTMLHeadingElement, HTMLAttributes<HTMLHeadingElement>>(
  ({ children, className = "", ...props }, ref) => (
    <h3 ref={ref} className={`text-heading-md font-semibold text-terminal-text ${className}`} {...props}>{children}</h3>
  )
);
CardTitle.displayName = "CardTitle";

export const CardDescription = forwardRef<HTMLParagraphElement, HTMLAttributes<HTMLParagraphElement>>(
  ({ children, className = "", ...props }, ref) => (
    <p ref={ref} className={`text-body-sm text-terminal-muted mt-1 ${className}`} {...props}>{children}</p>
  )
);
CardDescription.displayName = "CardDescription";

export const CardContent = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ children, className = "", ...props }, ref) => (
    <div ref={ref} className={className} {...props}>{children}</div>
  )
);
CardContent.displayName = "CardContent";

export const CardFooter = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ children, className = "", ...props }, ref) => (
    <div ref={ref} className={`mt-4 pt-4 border-t border-terminal-border/50 flex items-center gap-2 ${className}`} {...props}>{children}</div>
  )
);
CardFooter.displayName = "CardFooter";
