type EnvVarOptions = {
    required?: boolean;
};

export function isUnresolvedAzureVariable(value: string): boolean {
    return /^\$\([A-Za-z0-9_.-]+\)$/.test(value.trim());
}

export function getEnvVar(name: string, options: EnvVarOptions = {}): string | undefined {
    const rawValue = process.env[name];
    const value = rawValue?.trim();
    const required = options.required ?? true;

    if (required && (value === undefined || value === '' || isUnresolvedAzureVariable(value))) {
        throw new Error(`${name} environment variable is not set`);
    }

    if (value === undefined || value === '' || isUnresolvedAzureVariable(value)) {
        return undefined;
    }

    return value;
}

export function getRequiredEnvVar(name: string): string {
    const value = getEnvVar(name, { required: true });
    return value!;
}
