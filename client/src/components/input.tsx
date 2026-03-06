import { InputHTMLAttributes, forwardRef } from "react";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(({ 
  className = "", 
  label, 
  error, 
  ...props 
}, ref) => {
  return (
    <div className="w-full flex flex-col gap-1.5">
      {label && <label className="text-sm font-semibold text-foreground/90 ml-1">{label}</label>}
      <input
        ref={ref}
        className={`
          w-full px-4 py-3 rounded-xl bg-background border-2 border-border
          text-foreground placeholder:text-muted-foreground
          focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/10
          transition-all duration-200
          ${error ? "border-destructive focus:border-destructive focus:ring-destructive/10" : ""}
          ${className}
        `}
        {...props}
      />
      {error && <span className="text-xs text-destructive ml-1">{error}</span>}
    </div>
  );
});

Input.displayName = "Input";
