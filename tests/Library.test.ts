import { Library } from '../src/Library';
import { Book } from '../src/Book';
import { Member } from '../src/Member';
import { MemberFactory } from '../src/MemberFactory';
import { Reservation } from '../src/Reservation';

describe('Library Management System Core Requirements Verification', () => {
  // Requirement 1: Directory & Class Structure
  describe('Requirement 1 & 9: Core Classes and Instantiate Book', () => {
    it('instantiates Book with correct properties and default state', () => {
      const myBook = new Book('1984', 'George Orwell');
      expect(myBook.title).toBe('1984');
      expect(myBook.author).toBe('George Orwell');
      expect(myBook.isReserved).toBe(false);
      expect(myBook.waitlist).toEqual([]);

      myBook.reserve();
      expect(myBook.isReserved).toBe(true);

      myBook.returnBook();
      expect(myBook.isReserved).toBe(false);
    });
  });

  // Requirement 2: MemberFactory class
  describe('Requirement 2: MemberFactory borrowingLimit logic', () => {
    it('creates standard member with borrowingLimit 3', () => {
      const member = MemberFactory.createMember('standard', 'John Doe');
      expect(member.type).toBe('standard');
      expect(member.borrowingLimit).toBe(3);
    });

    it('creates student member with borrowingLimit 5', () => {
      const member = MemberFactory.createMember('student', 'Ada Lovelace');
      expect(member.name).toBe('Ada Lovelace');
      expect(member.type).toBe('student');
      expect(member.borrowingLimit).toBe(5);
    });

    it('creates staff member with borrowingLimit 10', () => {
      const member = MemberFactory.createMember('staff', 'Dr. Smith');
      expect(member.type).toBe('staff');
      expect(member.borrowingLimit).toBe(10);
    });
  });

  // Requirement 3: Borrowing Limit Enforcement
  describe('Requirement 3: Enforce Borrowing Limit', () => {
    it('throws "Reservation limit reached" when 4th book is reserved for standard member', () => {
      const library = new Library();
      const member = library.registerMember('Bob', 'standard'); // limit 3

      const b1 = library.addBook('Book 1', 'Author 1');
      const b2 = library.addBook('Book 2', 'Author 2');
      const b3 = library.addBook('Book 3', 'Author 3');
      const b4 = library.addBook('Book 4', 'Author 4');

      expect(library.reserveBook(member, b1)).not.toBeNull();
      expect(library.reserveBook(member, b2)).not.toBeNull();
      expect(library.reserveBook(member, b3)).not.toBeNull();

      expect(() => {
        library.reserveBook(member, b4);
      }).toThrow('Reservation limit reached');
    });
  });

  // Requirement 4: Waitlist Return Notifications
  describe('Requirement 4: Waitlist Return Notification via console.log', () => {
    it('prints notifications for all waitlisted members when book is returned', () => {
      const library = new Library();
      const hobbit = library.addBook('The Hobbit', 'J.R.R. Tolkien');

      const borrower = library.registerMember('Borrower', 'standard');
      const alice = library.registerMember('Alice', 'standard');
      const bob = library.registerMember('Bob', 'standard');

      library.reserveBook(borrower, hobbit);
      library.reserveBook(alice, hobbit);
      library.reserveBook(bob, hobbit);

      const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

      library.returnBook('The Hobbit');

      expect(consoleSpy).toHaveBeenCalledWith(
        'Notification for Alice: The book "The Hobbit" is now available.'
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        'Notification for Bob: The book "The Hobbit" is now available.'
      );

      consoleSpy.mockRestore();
    });
  });

  // Requirement 5: FIFO Waitlist Behavior
  describe('Requirement 5: FIFO Waitlist Auto-assignment', () => {
    it('automatically reserves returned book for first waitlisted member (Dave)', () => {
      const library = new Library();
      const dune = library.addBook('Dune', 'Frank Herbert');

      const charlie = library.registerMember('Charlie', 'standard');
      const dave = library.registerMember('Dave', 'standard');
      const eve = library.registerMember('Eve', 'standard');

      library.reserveBook(charlie, dune);
      library.reserveBook(dave, dune); // Dave on waitlist (1st)
      library.reserveBook(eve, dune);  // Eve on waitlist (2nd)

      expect(dune.waitlist).toHaveLength(2);
      expect(dune.waitlist[0].name).toBe('Dave');
      expect(dune.waitlist[1].name).toBe('Eve');

      library.returnBook('Dune');

      // Dune should now be reserved by Dave
      expect(dune.isReserved).toBe(true);
      expect(dune.reservedBy?.name).toBe('Dave');

      // Eve remains on waitlist
      expect(dune.waitlist).toHaveLength(1);
      expect(dune.waitlist[0].name).toBe('Eve');
    });
  });

  // Requirement 6: Overdue Fine Calculation
  describe('Requirement 6: Overdue Fine Calculation ($0.50 / day)', () => {
    it('calculates fine as 5 for a reservation 10 days overdue', () => {
      const library = new Library();
      const member = library.registerMember('Member 1', 'standard');
      const book = library.addBook('Some Book', 'Some Author');

      const now = new Date();
      const tenDaysAgo = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000);

      const reservation = new Reservation(member, book, undefined, tenDaysAgo);

      const fine = library.calculateFine(reservation, now);
      expect(fine).toBe(5); // 10 days * $0.50/day = $5.00
    });
  });

  // Requirement 10: Library Central Facade
  describe('Requirement 10: Library Facade Operations', () => {
    it('adds book and finds book by title', () => {
      const library = new Library();
      library.addBook('Foundation', 'Isaac Asimov');

      const found = library.findBook('Foundation');
      expect(found).not.toBeNull();
      expect(found?.title).toBe('Foundation');
      expect(found?.author).toBe('Isaac Asimov');

      const notFound = library.findBook('Non-Existent Book');
      expect(notFound).toBeNull();
    });
  });
});
