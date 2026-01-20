import { FHStruct, FHStructType } from "./FHStruct.ts";
import { FHStructLoader } from "./FHStructLoader.ts";

export class FHCommonCatalogData {
  constructor(
    public readonly airDynamicData?: FHStruct,
    public readonly airPartDynamicData?: FHStruct,
    public readonly ammoDynamicData?: FHStruct,
    public readonly itemDynamicData?: FHStruct,
    public readonly itemProfiles?: FHStruct,
    public readonly grenadeDynamicData?: FHStruct,
    public readonly weaponDynamicData?: FHStruct,
    public readonly vehicleDynamicData?: FHStruct,
    public readonly vehicleProfileList?: FHStruct,
    public readonly vehicleMovementProfileList?: FHStruct,
    public readonly structureProfileList?: FHStruct,
    public readonly structureDynamicData?: FHStruct,
    public readonly factoryProductionData?: FHStruct,
    public readonly massProductionFactoryProductionData?: FHStruct,
  ) {}

  get factoryProductionCategories() {
    return this.factoryProductionData?.extractValues(["Properties"], [["ProductionCategories"]])
      ?.ProductionCategories;
  }

  get massProductionFactoryProductionCategories() {
    return this.massProductionFactoryProductionData?.extractValues(
      ["Properties"],
      [["ProductionCategories"]],
    )?.ProductionCategories;
  }

  static async init(loader: FHStructLoader) {
    return new FHCommonCatalogData(
      await loader.getStruct(
        // airDynamicData
        "War/Content/Blueprints/Data/BPAirDynamicData",
        FHStructType.TABLE,
        false,
      ),

      await loader.getStruct(
        // airPartDynamicData
        "War/Content/Blueprints/Data/BPAircraftPartDynamicData",
        FHStructType.TABLE,
        false,
      ),

      await loader.getStruct(
        // facilityFactoryAircraft
        "War/Content/Blueprints/Structures/Facilities/BPFacilityFactoryAircraft",
        FHStructType.FACTORY,
        false,
      ),

      await loader.getStruct(
        // facilityFactoryAmmo
        "War/Content/Blueprints/Structures/Facilities/BPFacilityFactoryAmmo",
        FHStructType.FACTORY,
        false,
      ),

      await loader.getStruct(
        // ammoDynamicData
        "War/Content/Blueprints/Data/BPAmmoDynamicData",
        FHStructType.TABLE,
        false,
      ),
      await loader.getStruct(
        // itemDynamicData
        "War/Content/Blueprints/Data/BPItemDynamicData",
        FHStructType.TABLE,
        false,
      ),
      await loader.getStruct(
        // itemProfiles
        "War/Content/Blueprints/Data/BPItemProfileTable",
      ),
      await loader.getStruct(
        // grenadeDynamicData
        "War/Content/Blueprints/Data/BPGrenadeDynamicData",
        FHStructType.TABLE,
        false,
      ),
      await loader.getStruct(
        // weaponDynamicData
        "War/Content/Blueprints/Data/BPWeaponDynamicData",
        FHStructType.TABLE,
        false,
      ),
      await loader.getStruct(
        // vehicleDynamicData
        "War/Content/Blueprints/Data/BPVehicleDynamicData",
        FHStructType.TABLE,
        false,
      ),
      await loader.getStruct(
        // vehicleProfileList
        "War/Content/Blueprints/Data/BPVehicleProfileList",
      ),
      await loader.getStruct(
        // vehicleMovementProfileList
        "War/Content/Blueprints/Data/BPVehicleMovementProfileList",
      ),
      await loader.getStruct(
        // structureProfileList
        "War/Content/Blueprints/Data/BPStructureProfileList",
      ),
      await loader.getStruct(
        // structureDynamicData
        "War/Content/Blueprints/Data/BPStructureDynamicData",
        FHStructType.TABLE,
        false,
      ),
      await loader.getStruct(
        // factoryProductionData
        "War/Content/Blueprints/Structures/BPFactory",
        FHStructType.FACTORY,
        false,
      ),
      await loader.getStruct(
        // massProductionFactoryProductionData
        "War/Content/Blueprints/Structures/BPMassProduction",
        FHStructType.FACTORY,
        false,
      ),
    );
  }
}
