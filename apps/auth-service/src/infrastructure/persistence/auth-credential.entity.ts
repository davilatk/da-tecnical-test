import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity({ name: 'auth_credentials' })
export class AuthCredentialEntity {
  @PrimaryColumn({ type: 'uuid' })
  id!: string;

  @Column({ type: 'varchar', length: 254, unique: true, nullable: false })
  email!: string;

  @Column({ name: 'password_hash', type: 'varchar', length: 255, nullable: false })
  passwordHash!: string;

  @Column({ type: 'varchar', length: 20, array: true, nullable: false })
  roles!: string[];

  @Column({ name: 'created_at', type: 'timestamptz', nullable: false, default: () => 'now()' })
  createdAt!: Date;

  @Column({ name: 'updated_at', type: 'timestamptz', nullable: false, default: () => 'now()' })
  updatedAt!: Date;
}
