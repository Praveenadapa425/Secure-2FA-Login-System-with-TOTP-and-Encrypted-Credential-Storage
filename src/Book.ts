import { Member } from './Member';

export class Book {
  public title: string;
  public author: string;
  public isReserved: boolean = false;
  public reservedBy: Member | null = null;
  public waitlist: Member[] = [];

  constructor(title: string, author: string) {
    this.title = title;
    this.author = author;
  }

  /**
   * Marks the book as reserved and optionally sets the borrowing member.
   *
   * @param member - The member reserving the book.
   */
  public reserve(member?: Member): void {
    this.isReserved = true;
    if (member) {
      this.reservedBy = member;
    }
  }

  /**
   * Resets the reservation status of the book.
   */
  public returnBook(): void {
    this.isReserved = false;
    this.reservedBy = null;
  }

  /**
   * Adds a member to the FIFO waitlist for this book.
   *
   * @param member - The member to add to the waitlist.
   */
  public addToWaitlist(member: Member): void {
    this.waitlist.push(member);
  }
}
