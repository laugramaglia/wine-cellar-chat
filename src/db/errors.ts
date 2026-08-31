/** A rule the database itself would refuse. Named, so handlers report it rather than
 *  leaking a raw constraint violation to an agent. */
export class DbError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'DbError';
  }
}

export const notFound = (what: string, id: string) =>
  new DbError('not_found', `No ${what} with id '${id}'.`);
