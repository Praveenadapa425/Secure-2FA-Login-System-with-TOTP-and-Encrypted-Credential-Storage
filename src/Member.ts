import crypto from 'crypto';

export interface IMember {
  id: string;
  name: string;
  type: string;
  borrowingLimit: number;
}

export class Member implements IMember {
  public id: string;
  public name: string;
  public type: string;
  public borrowingLimit: number;
  public activeBorrowCount: number = 0;

  constructor(name: string, type: string, borrowingLimit: number, id?: string) {
    this.name = name;
    this.type = type.toLowerCase();
    this.borrowingLimit = borrowingLimit;
    this.id = id || (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2, 11));
  }
}
