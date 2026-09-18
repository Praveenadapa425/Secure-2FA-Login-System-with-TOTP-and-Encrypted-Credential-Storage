import { Member } from './Member';

export class MemberFactory {
  /**
   * Creates a new Member instance based on member type.
   *
   * @param type - The type of member ('standard', 'student', 'staff').
   * @param name - The name of the member.
   * @returns A new Member object with appropriate borrowingLimit.
   * @throws Error if an invalid member type is provided.
   */
  public static createMember(type: string, name: string): Member {
    const normalizedType = type ? type.toLowerCase().trim() : '';

    let limit: number;
    switch (normalizedType) {
      case 'standard':
        limit = 3;
        break;
      case 'student':
        limit = 5;
        break;
      case 'staff':
        limit = 10;
        break;
      default:
        throw new Error(`Invalid member type: ${type}`);
    }

    return new Member(name, normalizedType, limit);
  }
}
