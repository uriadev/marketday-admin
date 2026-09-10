import { toDomainError } from './graphql-errors';

describe('toDomainError', () => {
  it('turns a guard’s bare refusal into a sentence a person can read', () => {
    // `RolesGuard` returning false — Nest's own message, and nothing else.
    expect(
      toDomainError([{ message: 'Forbidden resource', extensions: { code: 'FORBIDDEN' } }]).message,
    ).toBe('You do not have permission to do that.');
    // A bare `new ForbiddenException()`.
    expect(
      toDomainError([
        {
          message: 'Forbidden',
          extensions: {
            code: 'FORBIDDEN',
            originalError: { statusCode: 403, message: 'Forbidden' },
          },
        },
      ]).message,
    ).toBe('You do not have permission to do that.');
  });

  it('shows a refusal that already says why', () => {
    // `AuthService.issueTokens` on a suspended account: a 403 with its own
    // sentence, which the sign-in screen must show rather than paper over.
    expect(
      toDomainError([
        {
          message: 'This account has been suspended.',
          extensions: {
            code: 'FORBIDDEN',
            originalError: { statusCode: 403, message: 'This account has been suspended.' },
          },
        },
      ]).message,
    ).toBe('This account has been suspended.');
  });

  it('joins a validation failure’s messages', () => {
    expect(
      toDomainError([
        {
          message: 'Bad Request Exception',
          extensions: { originalError: { message: ['reason should not be empty', 'too long'] } },
        },
      ]).message,
    ).toBe('reason should not be empty too long');
  });
});
