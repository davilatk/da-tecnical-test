export interface SchemaIssue {
  path: string;
  keyword: string;
}

export class ContractError extends Error {
  readonly issues: readonly SchemaIssue[];

  constructor(message: string, issues: readonly SchemaIssue[] = []) {
    super(message);
    this.name = 'ContractError';
    this.issues = issues;
  }
}
