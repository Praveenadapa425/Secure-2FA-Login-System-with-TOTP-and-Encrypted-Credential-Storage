import { Book } from './Book';
import { Member } from './Member';
import { MemberFactory } from './MemberFactory';
import { Reservation } from './Reservation';

export class Library {
  public books: Book[] = [];
  public members: Member[] = [];
  public reservations: Reservation[] = [];

  /**
   * Adds a new book to the library collection.
   *
   * @param title - The title of the book.
   * @param author - The author of the book.
   * @returns The newly created Book instance.
   */
  public addBook(title: string, author: string): Book {
    const book = new Book(title, author);
    this.books.push(book);
    return book;
  }

  /**
   * Registers a new member using the MemberFactory.
   *
   * @param name - The name of the member.
   * @param type - The member type ('standard', 'student', 'staff').
   * @returns The newly registered Member instance.
   */
  public registerMember(name: string, type: string): Member {
    const member = MemberFactory.createMember(type, name);
    this.members.push(member);
    return member;
  }

  /**
   * Finds a book in the library collection by title.
   *
   * @param title - The title of the book to search for.
   * @returns The Book instance if found, or null.
   */
  public findBook(title: string): Book | null {
    const found = this.books.find(
      (b) => b.title.toLowerCase() === title.toLowerCase()
    );
    return found || null;
  }

  /**
   * Finds a member by unique ID.
   *
   * @param id - The ID of the member.
   * @returns The Member instance if found, or null.
   */
  public findMember(id: string): Member | null {
    const found = this.members.find((m) => m.id === id);
    return found || null;
  }

  /**
   * Finds a member by name.
   *
   * @param name - The name of the member.
   * @returns The Member instance if found, or null.
   */
  public findMemberByName(name: string): Member | null {
    const found = this.members.find(
      (m) => m.name.toLowerCase() === name.toLowerCase()
    );
    return found || null;
  }

  /**
   * Reserves a book for a member, enforcing borrowing limits and handling waitlists.
   *
   * @param memberOrIdentifier - Member object, ID, or name.
   * @param bookTitleOrObject - Book object or title string.
   * @returns The Reservation instance if reserved, or null if added to waitlist.
   * @throws Error with message "Reservation limit reached" if member is at limit.
   */
  public reserveBook(
    memberOrIdentifier: Member | string,
    bookTitleOrObject: Book | string
  ): Reservation | null {
    let member: Member | null = null;
    if (typeof memberOrIdentifier === 'string') {
      member =
        this.findMember(memberOrIdentifier) ||
        this.findMemberByName(memberOrIdentifier);
      if (!member) {
        throw new Error(`Member not found: ${memberOrIdentifier}`);
      }
    } else {
      member = memberOrIdentifier;
    }

    let book: Book | null = null;
    if (typeof bookTitleOrObject === 'string') {
      book = this.findBook(bookTitleOrObject);
      if (!book) {
        throw new Error(`Book not found: ${bookTitleOrObject}`);
      }
    } else {
      book = bookTitleOrObject;
    }

    // Check borrowing limit FIRST
    if (member.activeBorrowCount >= member.borrowingLimit) {
      throw new Error('Reservation limit reached');
    }

    // If book is already reserved, add member to waitlist
    if (book.isReserved) {
      book.addToWaitlist(member);
      return null;
    }

    // Reserve book for member
    book.reserve(member);
    member.activeBorrowCount++;

    const reservation = new Reservation(member, book);
    this.reservations.push(reservation);
    return reservation;
  }

  /**
   * Processes the return of a book, notifying waitlisted members and auto-assigning to FIFO waiter.
   *
   * @param bookTitleOrObject - Book object or title string.
   */
  public returnBook(bookTitleOrObject: Book | string): void {
    let book: Book | null = null;
    if (typeof bookTitleOrObject === 'string') {
      book = this.findBook(bookTitleOrObject);
      if (!book) {
        throw new Error(`Book not found: ${bookTitleOrObject}`);
      }
    } else {
      book = bookTitleOrObject;
    }

    if (book.reservedBy) {
      book.reservedBy.activeBorrowCount = Math.max(
        0,
        book.reservedBy.activeBorrowCount - 1
      );
    }
    book.returnBook();

    // Requirement 4: Notify ALL members on waitlist
    if (book.waitlist.length > 0) {
      for (const waiter of book.waitlist) {
        console.log(
          `Notification for ${waiter.name}: The book "${book.title}" is now available.`
        );
      }

      // Requirement 5: FIFO waitlist auto-assignment to first waiter
      const nextMember = book.waitlist.shift()!;
      book.reserve(nextMember);
      nextMember.activeBorrowCount++;
      const newReservation = new Reservation(nextMember, book);
      this.reservations.push(newReservation);
    }
  }

  /**
   * Calculates the overdue fine for a reservation at a fixed rate of $0.50 per day overdue.
   *
   * @param reservation - The Reservation object.
   * @param currentDate - Optional current date for testing (defaults to now).
   * @returns The calculated fine amount in dollars.
   */
  public calculateFine(reservation: Reservation, currentDate: Date = new Date()): number {
    const dueTime = reservation.dueDate.getTime();
    const currTime = currentDate.getTime();

    if (currTime <= dueTime) {
      return 0;
    }

    const diffMs = currTime - dueTime;
    const daysOverdue = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    return daysOverdue * 0.50;
  }
}
