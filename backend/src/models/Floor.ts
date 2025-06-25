// Floor.ts
import {
  Table,
  Column,
  Model,
  DataType,
  PrimaryKey,
  Default,
  AllowNull,
  BelongsTo,
  HasMany,
  ForeignKey,
  Scopes
} from 'sequelize-typescript';
import { v4 as uuidv4 } from 'uuid';
import { Building } from './Building';
import { Unit } from './Unit';

@Scopes(() => ({
  withBuilding: {
    include: [{
      model: Building,
      as: 'building'
    }]
  },
  withUnits: {
    include: [{
      model: Unit,
      as: 'units',
      order: [['unit_number', 'ASC']]
    }]
  }
}))
@Table({
  tableName: 'floors',
  timestamps: true,
  underscored: true
})
export class Floor extends Model {
  @PrimaryKey
  @Default(uuidv4)
  @Column(DataType.UUID)
  id!: string;

  @ForeignKey(() => Building)
  @AllowNull(false)
  @Column(DataType.UUID)
  building_id!: string;

  @AllowNull(false)
  @Column(DataType.INTEGER)
  floor_number!: number;

  @Column(DataType.STRING(100))
  name?: string;

  @Default(0)
  @Column(DataType.INTEGER)
  units_count!: number;

  @Column(DataType.STRING(500))
  layout_image_url?: string;

  @Column(DataType.DATE)
  created_at!: Date;

  // Asociaciones
  @BelongsTo(() => Building)
  building?: Building;

  @HasMany(() => Unit, { foreignKey: 'floor_id' })
  units?: Unit[];

  // Métodos
  async getOccupiedUnits(): Promise<number> {
    return await Unit.count({
      where: { 
        floor_id: this.id,
        is_occupied: true 
      }
    });
  }

  get displayName(): string {
    if (this.name) {
      return `${this.name} (Piso ${this.floor_number})`;
    }
    return `Piso ${this.floor_number}`;
  }
}

// Unit.ts
import {
  Table,
  Column,
  Model,
  DataType,
  PrimaryKey,
  Default,
  AllowNull,
  BelongsTo,
  HasMany,
  ForeignKey,
  Scopes
} from 'sequelize-typescript';
import { CommunityMember } from './CommunityMember';

export enum UnitType {
  APARTMENT = 'apartment',
  OFFICE = 'office',
  COMMERCIAL = 'commercial',
  STORAGE = 'storage'
}

export enum OwnershipType {
  OWNED = 'owned',
  RENTED = 'rented'
}

@Scopes(() => ({
  withBuilding: {
    include: [{
      model: Building,
      as: 'building'
    }]
  },
  withFloor: {
    include: [{
      model: Floor,
      as: 'floor'
    }]
  },
  withMembers: {
    include: [{
      model: CommunityMember,
      as: 'members',
      where: { is_active: true }
    }]
  },
  occupied: {
    where: {
      is_occupied: true
    }
  },
  available: {
    where: {
      is_occupied: false
    }
  }
}))
@Table({
  tableName: 'units',
  timestamps: true,
  underscored: true
})
export class Unit extends Model {
  @PrimaryKey
  @Default(uuidv4)
  @Column(DataType.UUID)
  id!: string;

  @ForeignKey(() => Building)
  @AllowNull(false)
  @Column(DataType.UUID)
  building_id!: string;

  @ForeignKey(() => Floor)
  @Column(DataType.UUID)
  floor_id?: string;

  @AllowNull(false)
  @Column(DataType.STRING(20))
  unit_number!: string;

  @Default(UnitType.APARTMENT)
  @Column(DataType.ENUM(...Object.values(UnitType)))
  unit_type!: UnitType;

  @Column(DataType.DECIMAL(10, 2))
  area_sqm?: number;

  @Column(DataType.INTEGER)
  bedrooms?: number;

  @Column(DataType.INTEGER)
  bathrooms?: number;

  @Default(0)
  @Column(DataType.INTEGER)
  parking_spaces!: number;

  @Default(0)
  @Column(DataType.INTEGER)
  storage_units!: number;

  @Default(OwnershipType.OWNED)
  @Column(DataType.ENUM(...Object.values(OwnershipType)))
  ownership_type!: OwnershipType;

  @Default(false)
  @Column(DataType.BOOLEAN)
  is_occupied!: boolean;

  @Column(DataType.DATE)
  created_at!: Date;

  @Column(DataType.DATE)
  updated_at!: Date;

  // Asociaciones
  @BelongsTo(() => Building)
  building?: Building;

  @BelongsTo(() => Floor)
  floor?: Floor;

  @HasMany(() => CommunityMember, { foreignKey: 'unit_id' })
  members?: CommunityMember[];

  // Métodos
  async getActiveMembers(): Promise<CommunityMember[]> {
    return await CommunityMember.findAll({
      where: { 
        unit_id: this.id,
        is_active: true 
      },
      include: [{
        model: User,
        as: 'user'
      }]
    });
  }

  async getPrimaryResident(): Promise<CommunityMember | null> {
    return await CommunityMember.findOne({
      where: { 
        unit_id: this.id,
        is_primary_resident: true,
        is_active: true 
      },
      include: [{
        model: User,
        as: 'user'
      }]
    });
  }

  get fullAddress(): string {
    if (this.floor && this.building) {
      return `${this.building.name}, Piso ${this.floor.floor_number}, Unidad ${this.unit_number}`;
    }
    if (this.building) {
      return `${this.building.name}, Unidad ${this.unit_number}`;
    }
    return `Unidad ${this.unit_number}`;
  }

  // Métodos estáticos
  static async findByBuilding(buildingId: string): Promise<Unit[]> {
    return this.scope(['withFloor', 'withMembers']).findAll({
      where: { building_id: buildingId },
      order: [['unit_number', 'ASC']]
    });
  }

  static async findAvailable(buildingId: string): Promise<Unit[]> {
    return this.scope('available').findAll({
      where: { building_id: buildingId },
      order: [['unit_number', 'ASC']]
    });
  }
}
