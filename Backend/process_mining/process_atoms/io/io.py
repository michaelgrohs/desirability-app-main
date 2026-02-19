import json
from typing import List, Type

from process_mining.process_atoms.models.processatom import ProcessAtom


def serialize_objects_to_json(objects: List[ProcessAtom]) -> str:
    """
    Serializes a list of Atom objects to a JSON string.

    Args:
        objects (List[ProcessAtom]): List of Atom objects to serialize.

    Returns:
        str: JSON string representing the list of objects.
    """
    # Use Pydantic's .json() method to convert objects to JSON-compatible dictionaries
    data = [obj.model_dump() for obj in objects]
    return json.dumps(data)


def deserialize_json_to_objects(
    json_data: str, model: Type[ProcessAtom]
) -> List[ProcessAtom]:
    """
    Deserializes a JSON string into a list of Atom objects.

    Args:
        json_data (str): JSON string to deserialize.
        model (Type[ProcessAtom]): Atom model to reconstruct objects.

    Returns:
        List[ProcessAtom]: List of reconstructed Atom objects.
    """
    # Load JSON data into list of dictionaries and convert each to a Pydantic object
    data = json.loads(json_data)
    return [model(**item) for item in data]


def load_atoms_from_json_file(
    file_path: str, model: Type[ProcessAtom]
) -> List[ProcessAtom]:
    """
    Loads a list of Atom objects from a JSON file.

    Args:
        file_path (str): Path to the JSON file.
        model (Type[ProcessAtom]): Atom model to reconstruct objects.

    Returns:
        List[ProcessAtom]: List of reconstructed Atom objects.
    """
    with open(file_path, "r") as file:
        json_data = file.read()
    return deserialize_json_to_objects(json_data, model)


def save_atoms_to_json_file(atoms: List[ProcessAtom], file_path: str):
    """
    Saves a list of Atom objects to a JSON file.

    Args:
        atoms (List[ProcessAtom]): List of Atom objects to save.
        file_path (str): Path to the JSON file.
    """
    json_data = serialize_objects_to_json(atoms)
    with open(file_path, "w") as file:
        file.write(json_data)
