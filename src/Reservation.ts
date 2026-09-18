import { Member } from './Member';
import { Book } from './Book';

export class Reservation {
  public id: string;
  public member: Member;
  public book: Book;
  public issueDate: Date;
  public dueDate: Date;

  constructor(member: Member, book: Book, issueDate?: Date, dueDate?: Date) {
    this.id = Math.random().toString(36).substring(2, 11);
    this.member = member;
    this.book = book;
    this.issueDate = issueDate || new Date();
    this.dueDate = dueDate || new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
  }
}
